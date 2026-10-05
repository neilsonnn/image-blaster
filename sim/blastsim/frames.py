"""The single place where viewer/World Labs frames become sim frames.

Viewer (three.js) conventions, from app/src:
- y-up, right-handed, meters-ish.
- World splat + collider group: position [0, groundPlaneOffset, 0], rotation [pi if flipY else 0, 0, 0],
  uniform scale metricScaleFactor (WorldCollider.tsx, SplatRenderer.tsx).
- Object instance (SceneObject.tsx): body at `position` with Euler `rotation` (XYZ, radians); the visual
  group is scaled by OBJECT_SCALE * scale and the glb is offset so its bounding-box bottom-center sits at
  the body origin (useSceneObjectVisual.ts).

Sim (MuJoCo) conventions: z-up, right-handed, meters, quaternions as (w, x, y, z).
"""

from __future__ import annotations

import numpy as np

VIEWER_OBJECT_SCALE = 0.5  # app/src/modules/scene/SceneObject.tsx OBJECT_SCALE

# y-up -> z-up: rotate +90 deg about x. (x, y, z)_yup -> (x, -z, y)_zup
Y_UP_TO_Z_UP = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]])


def rot_x(angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])


def rot_y(angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    return np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])


def rot_z(angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def euler_xyz_to_matrix(euler) -> np.ndarray:
    """three.js Euler order 'XYZ' (its default): R = Rx @ Ry @ Rz."""
    x, y, z = euler
    return rot_x(x) @ rot_y(y) @ rot_z(z)


def matrix_to_quat_wxyz(matrix: np.ndarray) -> np.ndarray:
    m = np.asarray(matrix, dtype=float)
    trace = np.trace(m)
    if trace > 0:
        s = 2.0 * np.sqrt(trace + 1.0)
        q = [0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = 2.0 * np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2])
        q = [(m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s]
    elif m[1, 1] > m[2, 2]:
        s = 2.0 * np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2])
        q = [(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s]
    else:
        s = 2.0 * np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1])
        q = [(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s]
    q = np.array(q)
    q /= np.linalg.norm(q)
    return q if q[0] >= 0 else -q


def points_y_up_to_z_up(points) -> np.ndarray:
    return np.asarray(points, dtype=float) @ Y_UP_TO_Z_UP.T


def rotation_y_up_to_z_up(matrix) -> np.ndarray:
    """Conjugate a y-up rotation whose local frame is also y-up (glb assets are y-up)."""
    return Y_UP_TO_Z_UP @ np.asarray(matrix, dtype=float) @ Y_UP_TO_Z_UP.T


def scale_y_up_to_z_up(scale) -> np.ndarray:
    """Axis-aligned local scale: y-up (sx, sy, sz) -> z-up (sx, sz, sy)."""
    sx, sy, sz = scale
    return np.array([sx, sz, sy], dtype=float)


def world_raw_to_viewer(points, metric_scale_factor: float = 1.0, ground_plane_offset: float = 0.0,
                        flip_y: bool = True) -> np.ndarray:
    """World Labs collider/splat vertices -> viewer y-up frame (same transform the app applies)."""
    rotation = rot_x(np.pi) if flip_y else np.eye(3)
    p = np.asarray(points, dtype=float) * metric_scale_factor
    return p @ rotation.T + np.array([0.0, ground_plane_offset, 0.0])


def world_raw_to_sim(points, metric_scale_factor: float = 1.0, ground_plane_offset: float = 0.0,
                     flip_y: bool = True) -> np.ndarray:
    return points_y_up_to_z_up(world_raw_to_viewer(points, metric_scale_factor, ground_plane_offset, flip_y))


def bottom_center_offset(vertices_y_up) -> np.ndarray:
    """Offset that puts a y-up mesh's bounding-box bottom-center at the origin (viewer anchoring)."""
    v = np.asarray(vertices_y_up, dtype=float)
    lo, hi = v.min(axis=0), v.max(axis=0)
    center = (lo + hi) / 2
    return np.array([-center[0], -lo[1], -center[2]])


def placement_to_sim_pose(position, rotation_euler_xyz) -> tuple[np.ndarray, np.ndarray]:
    """scene.json instance pose (y-up) -> MuJoCo body pos (z-up) and quat (w, x, y, z).

    The returned body frame is z-up-local, anchored at the asset's bottom-center like the viewer.
    """
    pos = points_y_up_to_z_up(position)
    rot = rotation_y_up_to_z_up(euler_xyz_to_matrix(rotation_euler_xyz))
    return pos, matrix_to_quat_wxyz(rot)


def viewer_object_scale(scale) -> np.ndarray:
    """Effective y-up scale the viewer applies to an object glb (OBJECT_SCALE * instance scale)."""
    return VIEWER_OBJECT_SCALE * np.asarray(scale, dtype=float)
