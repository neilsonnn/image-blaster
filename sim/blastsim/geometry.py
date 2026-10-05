"""Mesh utilities shared by robot and object pipelines."""

from __future__ import annotations

import numpy as np
import trimesh


def convex_decompose(mesh: trimesh.Trimesh, threshold: float = 0.05, max_hulls: int = 12,
                     max_faces: int = 6000, seed: int = 0) -> list[trimesh.Trimesh]:
    """CoACD approximate convex decomposition. MuJoCo collides each mesh geom as its convex hull, so non-convex
    shapes (mugs, bowls, L-shaped fingers) need several hulls. Dense meshes are decimated first: hull quality is
    insensitive to triangle count and CoACD time is not."""
    import coacd

    coacd.set_log_level("error")
    if len(mesh.faces) > max_faces:
        mesh = mesh.simplify_quadric_decimation(face_count=max_faces)
    parts = coacd.run_coacd(coacd.Mesh(np.asarray(mesh.vertices), np.asarray(mesh.faces)), threshold=threshold,
                            max_convex_hull=max_hulls, seed=seed)
    hulls = []
    for vertices, faces in parts:
        if len(vertices) < 4:
            continue
        hull = trimesh.Trimesh(vertices, faces).convex_hull
        if hull.volume > 0:
            hulls.append(hull)
    return hulls or [mesh.convex_hull]


def min_width_2d(points: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    """Minimum caliper width of a 2D point set: (width, closing_dir, centroid). Closing dir is unit, along the width."""
    from scipy.spatial import ConvexHull

    points = np.asarray(points, dtype=float)
    if len(points) < 3:
        raise ValueError("need at least 3 points")
    hull = points[ConvexHull(points).vertices]
    best = (np.inf, None)
    for i in range(len(hull)):
        edge = hull[(i + 1) % len(hull)] - hull[i]
        length = np.linalg.norm(edge)
        if length < 1e-12:
            continue
        normal = np.array([-edge[1], edge[0]]) / length
        width = float(np.ptp(hull @ normal))
        if width < best[0]:
            best = (width, normal)
    width, normal = best
    projections = hull @ normal
    center_along = (projections.max() + projections.min()) / 2
    tangent = np.array([-normal[1], normal[0]])
    center_tangent = ((hull @ tangent).max() + (hull @ tangent).min()) / 2
    centroid = normal * center_along + tangent * center_tangent
    return width, normal, centroid
