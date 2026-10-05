"""Facts derived from the pinned URDF + meshes: base footprint, arm reach, gripper opening."""

from __future__ import annotations

import mujoco
import numpy as np


def _collision_geoms(model: mujoco.MjModel, body_names: set[str] | None = None) -> list[int]:
    ids = []
    for g in range(model.ngeom):
        if model.geom_contype[g] == 0 and model.geom_conaffinity[g] == 0:
            continue
        if body_names is None or model.body(model.geom_bodyid[g]).name in body_names:
            ids.append(g)
    return ids


def _geom_world_points(model: mujoco.MjModel, data: mujoco.MjData, g: int) -> np.ndarray:
    if model.geom_type[g] == mujoco.mjtGeom.mjGEOM_MESH:
        mesh = model.geom_dataid[g]
        start, count = model.mesh_vertadr[mesh], model.mesh_vertnum[mesh]
        local = model.mesh_vert[start:start + count]
    else:  # conservative: bounding box corners of the geom's AABB
        half = model.geom_aabb[g, 3:]
        center = model.geom_aabb[g, :3]
        local = center + half * np.array([[sx, sy, sz] for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)])
    return data.geom_xpos[g] + local @ data.geom_xmat[g].reshape(3, 3).T


def _pose(model: mujoco.MjModel, key: str) -> mujoco.MjData:
    data = mujoco.MjData(model)
    mujoco.mj_resetDataKeyframe(model, data, model.key(key).id)
    mujoco.mj_forward(model, data)
    return data


def footprint(model: mujoco.MjModel, base_body: str, base_bodies: set[str], key: str) -> dict:
    data = _pose(model, key)
    base_pts = np.vstack([_geom_world_points(model, data, g) for g in _collision_geoms(model, base_bodies)])
    all_pts = np.vstack([_geom_world_points(model, data, g) for g in _collision_geoms(model)])
    origin = data.body(base_body).xpos
    return {
        "base_x_m": [float(base_pts[:, 0].min()), float(base_pts[:, 0].max())],
        "base_y_m": [float(base_pts[:, 1].min()), float(base_pts[:, 1].max())],
        "base_radius_m": float(np.linalg.norm(base_pts[:, :2] - origin[:2], axis=1).max()),
        "base_min_z_m": float(base_pts[:, 2].min()),
        f"robot_radius_at_{key}_m": float(np.linalg.norm(all_pts[:, :2] - origin[:2], axis=1).max()),
        f"robot_height_at_{key}_m": float(all_pts[:, 2].max()),
    }


def _pad_geoms(model: mujoco.MjModel, pad: str) -> list[int]:
    geoms = _collision_geoms(model, {pad})
    if not geoms:
        raise ValueError(f"no collision geoms on {pad}")
    return geoms


def _pad_points_in_gripper(model, data, gripper_body: str, pad: str) -> np.ndarray:
    body = model.body(gripper_body).id
    rotation, origin = data.xmat[body].reshape(3, 3), data.xpos[body]
    points = np.vstack([_geom_world_points(model, data, g) for g in _pad_geoms(model, pad)])
    return (points - origin) @ rotation


def gripper_opening(model: mujoco.MjModel, gripper: dict, gripper_body: str, pad_length: float = 0.04) -> dict:
    """Aperture between the fingers' inner faces, measured on the fingertip pads only.

    Gripper frame: +x approach, +y finger travel. Only collision points within `pad_length` of the fingertip count,
    so the racks inside the housing (which pass each other at different heights) don't masquerade as the aperture.
    """
    driver, follower = model.joint(gripper["driver"]), model.joint(gripper["follower"])
    pad_a, pad_b = gripper["pads"]
    data = mujoco.MjData(model)
    widths = {}
    for label, q in (("open", driver.range[1]), ("closed", driver.range[0])):
        data.qpos[:] = model.qpos0
        data.qpos[driver.qposadr[0]] = q
        data.qpos[follower.qposadr[0]] = -q
        mujoco.mj_forward(model, data)
        a = _pad_points_in_gripper(model, data, gripper_body, pad_a)
        b = _pad_points_in_gripper(model, data, gripper_body, pad_b)
        tip = max(a[:, 0].max(), b[:, 0].max())
        a, b = a[a[:, 0] >= tip - pad_length], b[b[:, 0] >= tip - pad_length]
        # the driver finger moves +y when opening, so its inner face is its lowest y
        widths[label] = float(a[:, 1].min() - b[:, 1].max())
    return {"max_open_width_m": widths["open"], "closed_gap_m": widths["closed"], "pad_length_m": pad_length}


def fingertip_offset(model: mujoco.MjModel, gripper_body: str, pads: list[str]) -> float:
    """How far the fingertips reach along the gripper's +x (approach) axis, in the gripper frame."""
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    body = model.body(gripper_body).id
    rotation, origin = data.xmat[body].reshape(3, 3), data.xpos[body]
    points = np.vstack([_geom_world_points(model, data, g) for pad in pads for g in _pad_geoms(model, pad)])
    return float(((points - origin) @ rotation)[:, 0].max())


def arm_reach(model: mujoco.MjModel, arm_joints: list[str], arm_base: str, gripper_body: str, pads: list[str],
              samples: int = 4000, seed: int = 0) -> dict:
    """Distance from the arm base to the fingertip point over uniformly sampled joint configs."""
    rng = np.random.default_rng(seed)
    data = mujoco.MjData(model)
    tip = np.array([fingertip_offset(model, gripper_body, pads), 0.0, 0.0])
    adr = [model.joint(j).qposadr[0] for j in arm_joints]
    ranges = np.array([model.joint(j).range for j in arm_joints])
    gripper = model.body(gripper_body).id
    distances = np.empty(samples)
    for i in range(samples):
        data.qpos[:] = model.qpos0
        data.qpos[adr] = rng.uniform(ranges[:, 0], ranges[:, 1])
        mujoco.mj_kinematics(model, data)
        tcp = data.xpos[gripper] + data.xmat[gripper].reshape(3, 3) @ tip
        distances[i] = np.linalg.norm(tcp - data.body(arm_base).xpos)
    return {"fingertip_offset_m": float(tip[0]), "reach_max_m": float(distances.max()),
            "reach_p95_m": float(np.percentile(distances, 95))}


def measure(model: mujoco.MjModel, robot_spec: dict, sim: dict) -> dict:
    groups = sim["position_groups"]
    left = sim["grippers"]["left"]
    out = {
        "footprint": footprint(model, sim["base"]["body"], set(sim["base"]["bodies"]), "ready"),
        "gripper": gripper_opening(model, left, "left_gripper_link"),
        "left_arm": arm_reach(model, groups["left_arm"]["joints"], "left_arm_base_link", "left_gripper_link", left["pads"]),
    }
    return out
