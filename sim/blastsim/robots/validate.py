"""Dynamic sanity checks for a built robot MJCF on a bare floor."""

from __future__ import annotations

import json
import time
from pathlib import Path

import mujoco
import numpy as np

from ..compile import COLLIDE_FLOOR
from ..schemas import CheckResult, ValidationReport
from . import load_robot_spec
from .build import load_sim_config
from .fetch import cache_dir


def robot_on_floor(mjcf: Path) -> mujoco.MjModel:
    spec = mujoco.MjSpec.from_file(str(mjcf))
    spec.worldbody.add_geom(name="floor", type=mujoco.mjtGeom.mjGEOM_PLANE, size=[10, 10, 0.1],
                            contype=COLLIDE_FLOOR, conaffinity=COLLIDE_FLOOR)
    return spec.compile()


def _run(model, data, seconds: float) -> None:
    for _ in range(int(round(seconds / model.opt.timestep))):
        mujoco.mj_step(model, data)


def _reset(model, data, key: str) -> None:
    mujoco.mj_resetDataKeyframe(model, data, model.key(key).id)
    mujoco.mj_forward(model, data)


def _qpos(model, data, joint: str) -> float:
    return float(data.qpos[model.joint(joint).qposadr[0]])


def _self_contacts(model, data) -> int:
    floor = model.geom("floor").id
    return sum(1 for c in data.contact[: data.ncon] if floor not in (c.geom1, c.geom2))


def validate(name: str = "r1lite") -> ValidationReport:
    robot_spec = load_robot_spec(name)
    sim = load_sim_config(name)
    robot_cache = cache_dir(name, robot_spec["variant"])
    model = robot_on_floor(robot_cache / f"{name}.xml")
    data = mujoco.MjData(model)
    checks: list[CheckResult] = []

    def check(name_, passed, value=None, threshold=None, detail=None, subject=None):
        checks.append(CheckResult(name=name_, passed=bool(passed), value=None if value is None else float(value),
                                  threshold=threshold, detail=detail, subject=subject))

    # 1. hold the ready pose
    _reset(model, data, "ready")
    target = data.qpos.copy()
    start = time.perf_counter()
    _run(model, data, 2.0)
    rtf = 2.0 / (time.perf_counter() - start)
    held = [j for g in sim["position_groups"].values() for j in g["joints"]]
    errors = [abs(_qpos(model, data, j) - target[model.joint(j).qposadr[0]]) for j in held]
    check("finite_state", np.isfinite(data.qpos).all() and np.isfinite(data.qvel).all())
    check("hold_ready_max_joint_error_rad", max(errors) < 0.02, max(errors), 0.02,
          subject=held[int(np.argmax(errors))])
    base_drift = float(np.linalg.norm(data.qpos[:2] - target[:2]))
    check("hold_ready_base_drift_m", base_drift < 1e-3, base_drift, 1e-3)
    check("ready_self_contacts", _self_contacts(model, data) == 0, _self_contacts(model, data), 0)
    check("realtime_factor", rtf > 1.0, rtf, 1.0, detail="sim seconds per wall second, robot only")

    # 2. gripper cycle (left), follower must mirror
    for side, gripper in sim["grippers"].items():
        act = model.actuator(f"{side}_gripper").id
        lo, hi = model.actuator_ctrlrange[act]
        for label, ctrl in (("close", lo), ("open", hi)):
            data.ctrl[act] = ctrl
            _run(model, data, 1.0)
            q = _qpos(model, data, gripper["driver"])
            check(f"{side}_gripper_{label}", abs(q - ctrl) < 0.003, abs(q - ctrl), 0.003, subject=gripper["driver"])
        mirror = abs(_qpos(model, data, gripper["driver"]) + _qpos(model, data, gripper["follower"]))
        check(f"{side}_gripper_mirror", mirror < 1e-3, mirror, 1e-3)

    # 3. base velocity tracking
    x, _, yaw = sim["base"]["joints"]
    for joint, command, label in ((x, 0.5, "base_x_0.5m_s"), (yaw, 1.0, "base_yaw_1rad_s")):
        _reset(model, data, "ready")
        before = _qpos(model, data, joint)
        data.ctrl[model.actuator(joint).id] = command
        _run(model, data, 1.0)
        moved = _qpos(model, data, joint) - before
        check(f"{label}_1s", 0.85 * command <= moved <= 1.02 * command, moved, command)

    report = ValidationReport(world="-", scene="robot-on-floor", robot=name,
                              passed=all(c.passed for c in checks), checks=checks)
    (robot_cache / "validation.json").write_text(json.dumps(report.model_dump(mode="json"), indent=2) + "\n")
    return report
