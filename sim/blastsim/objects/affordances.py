"""Geometric grasp affordances for rigid objects: antipodal pinch candidates from horizontal cross-sections.

Frames follow the R1 Lite gripper convention: +x approach, +y finger closing direction.
Handles, lids and other semantic parts need part segmentation and are not detected here.
"""

from __future__ import annotations

import numpy as np
import trimesh

from ..frames import matrix_to_quat_wxyz
from ..geometry import min_width_2d
from ..schemas import Affordance, Pose

SIDE_HEIGHTS = (0.25, 0.5, 0.75)
TOP_DEPTH_M = 0.03  # how deep a top-down pinch reaches below the top of the object


def _section_points(mesh: trimesh.Trimesh, z: float) -> np.ndarray | None:
    section = mesh.section(plane_origin=[0.0, 0.0, z], plane_normal=[0.0, 0.0, 1.0])
    if section is None or len(section.vertices) < 3:
        return None
    return np.asarray(section.vertices)[:, :2]


def _pose(position, approach, closing) -> Pose:
    approach = np.asarray(approach, dtype=float) / np.linalg.norm(approach)
    closing = np.asarray(closing, dtype=float)
    closing = closing - approach * (closing @ approach)
    closing /= np.linalg.norm(closing)
    rotation = np.column_stack([approach, closing, np.cross(approach, closing)])
    return Pose(pos=tuple(float(v) for v in position), quat=tuple(float(v) for v in matrix_to_quat_wxyz(rotation)))


def rim_affordance(mesh: trimesh.Trimesh, top_z: float) -> Affordance | None:
    """Open containers: pinch the wall at the rim (closing across the wall) instead of spanning the opening.

    The rim section of a hollow container has an outer and an inner loop; the wall is the gap between them, taken
    where it is thinnest so the pinch lands on a flat stretch (edge midpoints on a square bin)."""
    section = mesh.section(plane_origin=[0.0, 0.0, top_z], plane_normal=[0.0, 0.0, 1.0])
    if section is None:
        return None
    loops = sorted((np.asarray(loop)[:, :2] for loop in section.discrete if len(loop) >= 3),
                   key=lambda loop: np.ptp(loop[:, 0]) * np.ptp(loop[:, 1]), reverse=True)
    if len(loops) < 2:
        return None
    outer, inner = loops[0], loops[1]
    gaps = np.linalg.norm(outer[:, None, :] - inner[None, :, :], axis=2)
    nearest = gaps.argmin(axis=1)
    wall_per_point = gaps[np.arange(len(outer)), nearest]
    i = int(wall_per_point.argmin())
    wall = float(wall_per_point[i])
    if wall <= 0 or wall > 0.03:
        return None
    a, b = outer[i], inner[nearest[i]]
    closing = (b - a) / np.linalg.norm(b - a)
    center = (a + b) / 2
    return Affordance(kind="grasp", name="rim",
                      frame=_pose([center[0], center[1], top_z], [0.0, 0.0, -1.0], [closing[0], closing[1], 0.0]),
                      width_m=wall, approach=(0.0, 0.0, -1.0))


def grasp_affordances(mesh: trimesh.Trimesh, cavity: bool = False) -> list[Affordance]:
    height = float(mesh.bounds[1, 2])
    grasps: list[Affordance] = []
    for fraction in SIDE_HEIGHTS:
        z = fraction * height
        points = _section_points(mesh, z)
        if points is None:
            continue
        width, closing, center = min_width_2d(points)
        approach = np.array([-closing[1], closing[0], 0.0])  # horizontal, perpendicular to the closing axis
        grasps.append(Affordance(kind="grasp", name=f"side_{int(fraction * 100)}",
                                 frame=_pose([center[0], center[1], z], approach, [closing[0], closing[1], 0.0]),
                                 width_m=width, approach=tuple(float(v) for v in approach)))

    top_z = max(height - min(TOP_DEPTH_M, height / 2), 0.0)
    points = _section_points(mesh, top_z)
    if points is not None:
        width, closing, center = min_width_2d(points)
        grasps.append(Affordance(kind="grasp", name="top_down",
                                 frame=_pose([center[0], center[1], top_z], [0.0, 0.0, -1.0],
                                             [closing[0], closing[1], 0.0]),
                                 width_m=width, approach=(0.0, 0.0, -1.0)))
        if cavity and (rim := rim_affordance(mesh, top_z)):
            grasps.append(rim)
    return grasps


def support_affordance(mesh: trimesh.Trimesh) -> Affordance | None:
    """Flat top a smaller object could rest on (box lids, books, trays): largest upward face cluster near the top."""
    normals = mesh.face_normals
    centers = mesh.triangles_center
    height = float(mesh.bounds[1, 2])
    up = (normals[:, 2] > 0.95) & (centers[:, 2] > 0.9 * height)
    area = float(mesh.area_faces[up].sum())
    if area < 0.002:  # < ~4.5 cm square
        return None
    center = (centers[up] * mesh.area_faces[up, None]).sum(axis=0) / area
    return Affordance(kind="support_surface", name="top", frame=Pose(pos=tuple(float(v) for v in center)),
                      width_m=float(np.sqrt(area)))
