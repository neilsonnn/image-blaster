"""Mass, center of mass and inertia for rigid objects, aware of how the object is built.

Generated meshes are surfaces, not CAD solids: a mug may come back hollow (inner wall modeled) or filled in, and a
bottle is usually a closed outer skin. Treating every mesh as solid makes a mug weigh like a brick, so:
- solid: filled volume x density.
- shell / container: wall area x thickness x density, halved when the mesh models both wall faces (a cavity is
  detected), capped at the solid mass.
Every result is a ranged Param: the range covers density, wall thickness and the cavity ambiguity.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import trimesh

from ..schemas import Param

VOXELS_ACROSS = 64
SURFACE_SAMPLES = 20000
CAVITY_RATIO = 0.6  # filled volume / hull volume below this -> the mesh models an open cavity


@dataclass(frozen=True)
class MassProperties:
    mass: Param
    com: np.ndarray
    inertia: np.ndarray  # 3x3 about com, kg m^2 at nominal mass
    filled_volume_m3: float
    hull_volume_m3: float
    area_m2: float
    cavity: bool


def filled_volume(mesh: trimesh.Trimesh) -> tuple[float, np.ndarray]:
    """(volume, voxel centers). Exact for watertight meshes; voxel-filled otherwise (closed skins fill, open
    cavities stay empty, which is exactly the behavior the mass model wants)."""
    pitch = float(mesh.extents.max()) / VOXELS_ACROSS
    voxels = mesh.voxelized(pitch=pitch).fill()
    centers = np.asarray(voxels.points)
    volume = float(mesh.volume) if mesh.is_watertight and mesh.volume > 0 else float(voxels.volume)
    return volume, centers


def _point_inertia(points: np.ndarray, mass: float) -> tuple[np.ndarray, np.ndarray]:
    com = points.mean(axis=0)
    r = points - com
    m_i = mass / len(points)
    inertia = m_i * (np.eye(3) * (r * r).sum() - r.T @ r)
    return com, inertia


def _solid_inertia(mesh: trimesh.Trimesh, voxel_centers: np.ndarray, mass: float) -> tuple[np.ndarray, np.ndarray]:
    if mesh.is_watertight and mesh.volume > 0:
        scale = mass / mesh.volume  # trimesh mass properties assume density 1
        return np.asarray(mesh.center_mass), np.asarray(mesh.moment_inertia) * scale
    return _point_inertia(voxel_centers, mass)


def _shell_inertia(mesh: trimesh.Trimesh, mass: float, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    points, _ = trimesh.sample.sample_surface_even(mesh, SURFACE_SAMPLES, seed=seed)
    if len(points) < SURFACE_SAMPLES // 2:  # even sampling can under-deliver on tiny meshes
        points, _ = trimesh.sample.sample_surface(mesh, SURFACE_SAMPLES, seed=seed)
    return _point_inertia(np.asarray(points), mass)


def mass_properties(mesh: trimesh.Trimesh, mass_kind: str, density: Param, thickness: Param | None) -> MassProperties:
    volume, voxel_centers = filled_volume(mesh)
    hull_volume = float(mesh.convex_hull.volume)
    area = float(mesh.area)
    cavity = hull_volume > 0 and volume / hull_volume < CAVITY_RATIO
    solid = Param(value=density.value * volume, low=density.low * volume, high=density.high * volume,
                  unit="kg", source="prior")

    if mass_kind == "solid" or thickness is None:
        com, inertia = _solid_inertia(mesh, voxel_centers, solid.value)
        return MassProperties(solid, com, inertia, volume, hull_volume, area, cavity)

    # both wall faces modeled -> each face carries half the wall; ambiguous -> range spans both readings
    faces_nominal, faces_low = (0.5, 0.5) if cavity else (1.0, 0.5)
    nominal = density.value * thickness.value * area * faces_nominal
    low = density.low * thickness.low * area * faces_low
    high = density.high * thickness.high * area
    nominal, low, high = (min(v, solid.high) for v in (nominal, low, high))
    nominal = min(max(nominal, low), high)
    mass = Param(value=nominal, low=low, high=high, unit="kg", source="prior")
    com, inertia = _shell_inertia(mesh, mass.value)
    return MassProperties(mass, com, inertia, volume, hull_volume, area, cavity)


def full_inertia(inertia: np.ndarray) -> tuple[float, float, float, float, float, float]:
    """3x3 -> MuJoCo fullinertia order (ixx, iyy, izz, ixy, ixz, iyz)."""
    i = np.asarray(inertia)
    return (float(i[0, 0]), float(i[1, 1]), float(i[2, 2]), float(i[0, 1]), float(i[0, 2]), float(i[1, 2]))
