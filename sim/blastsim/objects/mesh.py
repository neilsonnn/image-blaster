"""Load a generated asset into the sim object frame and give it real-world scale."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh

from ..frames import Y_UP_TO_Z_UP


def load_asset_z_up(path: str | Path) -> trimesh.Trimesh:
    """glTF/GLB (y-up) -> one mesh in the sim object frame: z-up, origin at the bounding-box bottom-center.

    The viewer anchors objects the same way (useSceneObjectVisual.ts), so scene.json positions line up.
    """
    mesh = trimesh.load(path, force="mesh")
    if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
        raise ValueError(f"no triangle mesh in {path}")
    transform = np.eye(4)
    transform[:3, :3] = Y_UP_TO_Z_UP
    mesh.apply_transform(transform)
    lo, hi = mesh.bounds
    mesh.apply_translation([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
    return mesh


@dataclass(frozen=True)
class MetricScale:
    factor: float
    ratios: tuple[float, float, float]  # per-axis agreement (height, short side, long side)
    aspect_mismatch: float  # max/min ratio; 1.0 = generated shape matches the estimated box exactly


def metric_scale(extents, size_m) -> MetricScale:
    """Uniform scale from mesh extents to an estimated (width, depth, height) box.

    Generated meshes have arbitrary yaw, so the horizontal sides are matched by sorted length, and the median of
    the three ratios is used so one bad estimate cannot dominate.
    """
    ex, ey, ez = (float(e) for e in extents)
    sw, sd, sh = (float(s) for s in size_m)
    mesh_h = sorted([ex, ey])
    size_h = sorted([sw, sd])
    ratios = (sh / ez, size_h[0] / mesh_h[0], size_h[1] / mesh_h[1])
    if min(ratios) <= 0:
        raise ValueError(f"degenerate extents {extents} or size {size_m}")
    return MetricScale(float(np.median(ratios)), ratios, max(ratios) / min(ratios))


def repair(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Cheap cleanup that never changes the shape: merge duplicate vertices, drop degenerate faces, fix winding."""
    mesh = mesh.copy()
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.update_faces(mesh.unique_faces())
    mesh.remove_unreferenced_vertices()
    trimesh.repair.fix_normals(mesh)
    trimesh.repair.fill_holes(mesh)
    return mesh
