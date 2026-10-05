"""Procedural deformable shapes. Generated image-to-3D meshes of cloth come back as closed slabs, which a shell
solver cannot use, so cloth is rebuilt from a parametric outline at a known resolution; soft volumes use a tet grid.

Cloth meshes lie flat in the object frame: z = 0, centered on the origin, x across the width, y along the length.
"""

from __future__ import annotations

import numpy as np
import trimesh
from scipy.spatial import Delaunay

# Flat t-shirt outline, right half, as fractions of (sleeve-to-sleeve width, hem-to-shoulder length).
# Hem -> armpit -> sleeve hem -> sleeve top -> shoulder -> neckline; mirrored for the left half.
TSHIRT_RIGHT_HALF = [(0.33, 0.0), (0.33, 0.62), (0.50, 0.74), (0.42, 0.93), (0.24, 1.0), (0.12, 1.0), (0.0, 0.93)]


def tshirt_outline(width: float, length: float) -> np.ndarray:
    right = np.array(TSHIRT_RIGHT_HALF)
    left = right[-2:0:-1] * [-1, 1]  # mirror, skipping the shared center-neck point and the hem point order
    left = np.vstack([left, [[-0.33, 0.0]]])
    outline = np.vstack([right, left]) * [width, length]
    return outline - [0.0, length / 2]


def rect_outline(width: float, length: float) -> np.ndarray:
    w, l = width / 2, length / 2
    return np.array([(-w, -l), (w, -l), (w, l), (-w, l)])


OUTLINES = {"tshirt": tshirt_outline, "rect": rect_outline}
# Garments laid flat are front + back sewn together; simulated as one sheet with per-layer quantities summed
# (areal density x2, and Young's modulus x2 so membrane and bending stiffness both double at the same thickness).
LAYERS = {"tshirt": 2, "rect": 1}


def _inside(points: np.ndarray, polygon: np.ndarray) -> np.ndarray:
    """Even-odd ray casting, vectorized over points."""
    x, y = points[:, 0], points[:, 1]
    inside = np.zeros(len(points), dtype=bool)
    for (x1, y1), (x2, y2) in zip(polygon, np.roll(polygon, -1, axis=0)):
        crosses = (y1 > y) != (y2 > y)
        with np.errstate(divide="ignore", invalid="ignore"):
            x_at = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
        inside ^= crosses & (x < x_at)
    return inside


def _resample_boundary(polygon: np.ndarray, spacing: float) -> np.ndarray:
    points = []
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
        n = max(int(np.ceil(np.linalg.norm(b - a) / spacing)), 1)
        points.extend(a + (b - a) * t for t in np.arange(n) / n)
    return np.array(points)


def cloth_mesh(template: str, width: float, length: float, spacing: float) -> trimesh.Trimesh:
    """Flat triangle mesh of the outline: boundary resampled at `spacing`, interior on a staggered grid."""
    polygon = OUTLINES[template](width, length)
    boundary = _resample_boundary(polygon, spacing)
    lo, hi = polygon.min(axis=0), polygon.max(axis=0)
    ys = np.arange(lo[1] + spacing / 2, hi[1], spacing * np.sqrt(3) / 2)
    grid = np.vstack([np.column_stack([np.arange(lo[0] + (i % 2) * spacing / 2, hi[0], spacing), np.full_like(
        np.arange(lo[0] + (i % 2) * spacing / 2, hi[0], spacing), y)]) for i, y in enumerate(ys)])
    grid = grid[_inside(grid, polygon)]
    # keep interior points away from the boundary so no sliver triangles form along the edge
    distance = np.min(np.linalg.norm(grid[:, None, :] - boundary[None, :, :], axis=2), axis=1)
    points = np.vstack([boundary, grid[distance > spacing * 0.5]])
    triangles = Delaunay(points).simplices
    centroids = points[triangles].mean(axis=1)
    corners = points[triangles]
    longest = np.max(np.linalg.norm(corners - np.roll(corners, 1, axis=1), axis=2), axis=1)
    # Delaunay bridges concave notches (shoulder/sleeve) with long triangles whose centroid can still land inside,
    # and leaves zero-area slivers on collinear boundary runs; MuJoCo's bending model is singular on those
    edge = corners - np.roll(corners, 1, axis=1)
    area = 0.5 * np.abs(edge[:, 0, 0] * edge[:, 1, 1] - edge[:, 0, 1] * edge[:, 1, 0])
    triangles = triangles[_inside(centroids, polygon) & (longest < 1.8 * spacing) & (area > 0.05 * spacing**2)]
    vertices = np.column_stack([points, np.zeros(len(points))])
    mesh = trimesh.Trimesh(vertices, triangles, process=True)
    mesh.remove_unreferenced_vertices()
    return mesh


def spacing_for_budget(area_m2: float, vertex_budget: int, lo: float = 0.025, hi: float = 0.10) -> float:
    """Triangle-grid spacing that puts about `vertex_budget` vertices on `area_m2` (verts ~ area / (0.866 s^2)).

    The floor matters: finer cloth means lighter vertices against the same membrane stiffness, and below ~2.5 cm
    MuJoCo's flex solve goes ill-conditioned (a 2 cm t-shirt jittered at 6 cm/s indefinitely)."""
    return float(np.clip(np.sqrt(area_m2 / (vertex_budget * np.sqrt(3) / 2)), lo, hi))


def grid_counts(size: tuple[float, float, float], spacing: float, min_count: int = 2) -> tuple[int, int, int]:
    """Vertex counts for a flexcomp grid of the given box size."""
    return tuple(max(int(round(s / spacing)) + 1, min_count) for s in size)
