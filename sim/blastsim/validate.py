"""Dynamic checks for processed objects: drop each one on a floor and make sure it settles like a real thing."""

from __future__ import annotations

import json
import time
from pathlib import Path

import mujoco
import numpy as np

from .compile import COLLIDE_FLOOR
from .compile.objects import add_rigid_object, contact_params
from .paths import WorldPaths, latest_indexed
from .robots import load_robot_spec
from .robots.build import apply_option, load_sim_config
from .schemas import CheckResult, PhysicsFile, ValidationReport

DROP_HEIGHT_M = 0.01
SETTLE_SECONDS = 3.0


def base_spec(robot: str = "r1lite") -> mujoco.MjSpec:
    """Empty world with the robot's solver options and a floor."""
    spec = mujoco.MjSpec()
    apply_option(spec, load_sim_config(robot)["option"])
    floor = contact_params("generic_floor")
    spec.worldbody.add_geom(name="floor", type=mujoco.mjtGeom.mjGEOM_PLANE, size=[5, 5, 0.1],
                            contype=COLLIDE_FLOOR, conaffinity=COLLIDE_FLOOR, friction=floor["friction"],
                            solref=floor["solref"], solimp=floor["solimp"])
    return spec


def latest_physics(wp: WorldPaths, object_id: str) -> tuple[Path, PhysicsFile] | None:
    latest = latest_indexed(wp.object_sim_dir(object_id), f"{object_id}-physics", [".json"])
    if latest is None:
        return None
    return Path(latest.path), PhysicsFile.model_validate_json(Path(latest.path).read_text())


def drop_test(wp: WorldPaths, object_id: str, robot: str = "r1lite") -> ValidationReport:
    found = latest_physics(wp, object_id)
    if found is None:
        raise FileNotFoundError(f"{object_id}: no physics file; run `blastsim object` first")
    physics_path, physics_file = found
    spec = base_spec(robot)
    add_rigid_object(spec, wp.world, physics_file, object_id, pos=(0.0, 0.0, DROP_HEIGHT_M))
    model = spec.compile()
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    body = model.body(object_id).id
    start = data.xpos[body].copy()

    max_penetration = 0.0
    for _ in range(int(SETTLE_SECONDS / model.opt.timestep)):
        mujoco.mj_step(model, data)
        if data.ncon:
            max_penetration = max(max_penetration, -float(data.contact.dist[: data.ncon].min()))

    checks = []

    def check(name, passed, value=None, threshold=None, detail=None):
        checks.append(CheckResult(name=name, passed=bool(passed), value=None if value is None else float(value),
                                  threshold=threshold, detail=detail, subject=object_id))

    finite = bool(np.isfinite(data.qpos).all() and np.isfinite(data.qvel).all())
    check("finite_state", finite)
    if finite and physics_file.physics.sim_class == "rigid":
        lin = float(np.linalg.norm(data.cvel[body, 3:]))
        ang = float(np.linalg.norm(data.cvel[body, :3]))
        check("settled_linear_speed_m_s", lin < 0.01, lin, 0.01)
        check("settled_angular_speed_rad_s", ang < 0.05, ang, 0.05, detail="rolling objects fail this by design")
        check("max_penetration_m", max_penetration < 0.005, max_penetration, 0.005)
        drift = float(np.linalg.norm(data.xpos[body, :2] - start[:2]))
        check("horizontal_drift_m", drift < 0.05, drift, 0.05)
        z_axis = data.xmat[body].reshape(3, 3)[:, 2]
        tilt = float(np.degrees(np.arccos(np.clip(z_axis[2], -1, 1))))
        check("upright_tilt_deg", tilt < 30, tilt, 30, detail="generated base may be uneven; tipping = re-check mesh")

    payload = load_robot_spec(robot)["arms"].get("payload_kg_per_arm")
    mass = physics_file.physics.mass_kg
    if payload:
        check("mass_within_payload_kg", mass.high <= payload, mass.high, payload)
    report = ValidationReport(world=wp.slug, scene=f"drop:{object_id}", robot=robot,
                              passed=all(c.passed for c in checks), checks=checks)
    out = physics_path.with_name(physics_path.name.replace("-physics.json", "-validation.json"))
    out.write_text(json.dumps(report.model_dump(mode="json"), indent=2) + "\n")
    return report


SUPPORT_TOP_M = 0.45
SETTLE_DEFORMABLE_SECONDS = 1.5


def settle_test(wp: WorldPaths, object_id: str, robot: str = "r1lite") -> ValidationReport:
    """Drop a cloth/soft body onto a tiled bed-height support and check it rests, stays intact and does not sink."""
    from .compile.deformables import add_deformable, add_tiled_support

    found = latest_physics(wp, object_id)
    if found is None:
        raise FileNotFoundError(f"{object_id}: no physics file; run `blastsim object` first")
    physics_path, physics_file = found
    physics = physics_file.physics
    params = physics.template_params
    footprint = (params.get("width_m", params.get("size_x", 0.5)), params.get("length_m", params.get("size_y", 0.5)))
    half = [footprint[0] / 2 + 0.3, footprint[1] / 2 + 0.3, SUPPORT_TOP_M / 2]
    spec = base_spec(robot)
    add_tiled_support(spec, "support", [0, 0, SUPPORT_TOP_M / 2], half)
    flex_name = add_deformable(spec, wp.world, physics_file, object_id, pos=(0.0, 0.0, SUPPORT_TOP_M + 0.02))
    model = spec.compile()
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    flex = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_FLEX, flex_name)
    start, count = model.flex_vertadr[flex], model.flex_vertnum[flex]
    edges = model.flex_edge[model.flex_edgeadr[flex]: model.flex_edgeadr[flex] + model.flex_edgenum[flex]]
    rest = np.linalg.norm(data.flexvert_xpos[edges[:, 0] + start] - data.flexvert_xpos[edges[:, 1] + start], axis=1)
    height0 = np.ptp(data.flexvert_xpos[start:start + count, 2])

    wall = time.perf_counter()
    for _ in range(int(SETTLE_DEFORMABLE_SECONDS / model.opt.timestep)):
        mujoco.mj_step(model, data)
    rtf = SETTLE_DEFORMABLE_SECONDS / (time.perf_counter() - wall)

    checks = []

    def check(name, passed, value=None, threshold=None, detail=None):
        checks.append(CheckResult(name=name, passed=bool(passed), value=None if value is None else float(value),
                                  threshold=threshold, detail=detail, subject=object_id))

    verts = data.flexvert_xpos[start:start + count]
    finite = bool(np.isfinite(verts).all())
    check("finite_state", finite)
    if finite:
        radius = float(model.flex_radius[flex])
        sink = float(SUPPORT_TOP_M + radius - verts[:, 2].min())
        check("max_sink_below_contact_m", sink < 0.01, sink, 0.01, detail="vertices pushed into the support")
        stretch = float((np.linalg.norm(verts[edges[:, 0]] - verts[edges[:, 1]], axis=1) / rest).max())
        check("max_edge_stretch_ratio", stretch < 1.2, stretch, 1.2)
        bodies = model.flex_vertbodyid[start:start + count]
        speeds = np.linalg.norm(data.cvel[bodies, 3:], axis=1)
        p95 = float(np.percentile(speeds, 95))
        check("p95_vertex_speed_m_s", p95 < 0.05, p95, 0.05, detail="still moving after the settle window")
        check("max_vertex_speed_m_s", True, float(speeds.max()), None, detail="informational: loose edges flutter")
        if physics.sim_class == "deformable.volumetric":
            height = float(np.ptp(verts[:, 2]))
            check("height_retained_ratio", height / height0 > 0.5, height / height0, 0.5, detail="soft body collapsed")
    check("realtime_factor", True, rtf, None, detail="informational: CPU MuJoCo with this flex alone")
    report = ValidationReport(world=wp.slug, scene=f"settle:{object_id}", robot=robot,
                              passed=all(c.passed for c in checks), checks=checks)
    out = physics_path.with_name(physics_path.name.replace("-physics.json", "-validation.json"))
    out.write_text(json.dumps(report.model_dump(mode="json"), indent=2) + "\n")
    return report
