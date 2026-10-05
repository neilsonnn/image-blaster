"""Vendor URDF -> MuJoCo MJCF, driven by `spec.json` (vendor facts) and `sim.yaml` (sim choices)."""

from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from functools import cache
from importlib.resources import files
from pathlib import Path

import mujoco
import numpy as np
import yaml

from .. import priors
from ..compile import COLLIDE_ALL, COLLIDE_WORLD
from . import load_robot_spec
from .fetch import cache_dir, fetch

# MuJoCo cameras look down -z with +y up; vendor camera links are optical frames (+z forward, +y down).
OPTICAL_TO_MUJOCO_CAMERA_QUAT = (0.0, 1.0, 0.0, 0.0)

_INTEGRATORS = {"euler": mujoco.mjtIntegrator.mjINT_EULER, "implicitfast": mujoco.mjtIntegrator.mjINT_IMPLICITFAST,
                "implicit": mujoco.mjtIntegrator.mjINT_IMPLICIT, "rk4": mujoco.mjtIntegrator.mjINT_RK4,
                "discrete": mujoco.mjtIntegrator.mjINT_DISCRETE}
_SOLVERS = {"newton": mujoco.mjtSolver.mjSOL_NEWTON, "cg": mujoco.mjtSolver.mjSOL_CG, "pgs": mujoco.mjtSolver.mjSOL_PGS}

_CONES = {"pyramidal": mujoco.mjtCone.mjCONE_PYRAMIDAL, "elliptic": mujoco.mjtCone.mjCONE_ELLIPTIC}
_LIMITED = mujoco.mjtLimited.mjLIMITED_TRUE
_SCALAR_JOINTS = (int(mujoco.mjtJoint.mjJNT_HINGE), int(mujoco.mjtJoint.mjJNT_SLIDE))  # `in` on pybind enums vs numpy ints is False


def apply_option(spec: mujoco.MjSpec, opt: dict) -> None:
    spec.option.timestep = opt["timestep"]
    spec.option.integrator = _INTEGRATORS[opt["integrator"]]
    spec.option.solver = _SOLVERS[opt.get("solver", "newton").lower()]
    spec.option.cone = _CONES[opt["cone"]]
    spec.option.impratio = opt["impratio"]


@cache
def load_sim_config(name: str) -> dict:
    return yaml.safe_load(files(__package__).joinpath(name, "sim.yaml").read_text())


def urdf_to_spec(robot_cache: Path) -> mujoco.MjSpec:
    """Load the vendor URDF with local mesh paths, keeping fixed-joint bodies (cameras) and visual geoms."""
    root = ET.parse(robot_cache / "robot.urdf").getroot()
    for mesh in root.iter("mesh"):
        mesh.set("filename", "/".join(mesh.get("filename").rsplit("/", 2)[-2:]))
    mujoco_ext = ET.Element("mujoco")
    ET.SubElement(mujoco_ext, "compiler", meshdir=str(robot_cache.resolve()), strippath="false",
                  fusestatic="false", discardvisual="false", balanceinertia="true")
    root.insert(0, mujoco_ext)
    return mujoco.MjSpec.from_string(ET.tostring(root, encoding="unicode"))


def srdf_disabled_pairs(path: Path) -> list[tuple[str, str]]:
    root = ET.parse(path).getroot()
    return [(d.get("link1"), d.get("link2")) for d in root.iter("disable_collisions")]


def _subtree(body: mujoco.MjsBody) -> list[mujoco.MjsBody]:
    return [body, *body.find_all(mujoco.mjtObj.mjOBJ_BODY)]


def _is_collision_geom(geom) -> bool:
    return geom.contype != 0 or geom.conaffinity != 0


def decompose_collision(spec: mujoco.MjSpec, robot_cache: Path, cfg: dict, force: bool = False) -> None:
    """Replace a link's single collision mesh with CoACD convex parts (MuJoCo collides meshes as convex hulls).

    Needed for non-convex links such as the R1 Lite fingers, whose L-shaped rack makes the hull fill the grasp gap.
    Parts are cached under `collision_hulls/<link>/` next to the vendor meshes.
    """
    import trimesh

    from ..geometry import convex_decompose

    for link in cfg["links"]:
        body = spec.body(link)
        (geom,) = [g for g in body.geoms if _is_collision_geom(g)]
        mesh = spec.mesh(geom.meshname)
        out_dir = robot_cache / "collision_hulls" / link
        if force or not any(out_dir.glob("hull_*.obj")):
            out_dir.mkdir(parents=True, exist_ok=True)
            for old in out_dir.glob("hull_*.obj"):
                old.unlink()
            source = trimesh.load(robot_cache / mesh.file, force="mesh")
            hulls = convex_decompose(source, threshold=cfg["threshold"], max_hulls=cfg["max_hulls"])
            for i, hull in enumerate(hulls):
                hull.export(out_dir / f"hull_{i:02d}.obj")
        for i, hull in enumerate(sorted(out_dir.glob("hull_*.obj"))):
            name = f"{link}_hull{i:02d}"
            spec.add_mesh(name=name, file=str(hull.relative_to(robot_cache)), scale=list(mesh.scale))
            body.add_geom(name=name, type=mujoco.mjtGeom.mjGEOM_MESH, meshname=name, pos=list(geom.pos),
                          quat=list(geom.quat), contype=geom.contype, conaffinity=geom.conaffinity, group=geom.group)
        spec.delete(geom)


def configure(spec: mujoco.MjSpec, robot_spec: dict, sim: dict, srdf_pairs: list[tuple[str, str]],
              efforts: dict[str, float]) -> None:
    spec.modelname = robot_spec["robot"]
    apply_option(spec, sim["option"])

    # Planar base: world-frame x/y slides then yaw; vendor wheels stay as damped passive joints.
    base = sim["base"]
    base_body = spec.body(base["body"])
    x, y, yaw = base["joints"]
    base_body.add_joint(name=x, type=mujoco.mjtJoint.mjJNT_SLIDE, axis=[1, 0, 0])
    base_body.add_joint(name=y, type=mujoco.mjtJoint.mjJNT_SLIDE, axis=[0, 1, 0])
    base_body.add_joint(name=yaw, type=mujoco.mjtJoint.mjJNT_HINGE, axis=[0, 0, 1])
    for joint_name in base["passive_joints"]:
        spec.joint(joint_name).damping = [base["passive_damping"], 0, 0]

    defaults = sim["joint_defaults"]
    actuated = {j for group in sim["position_groups"].values() for j in group["joints"]}
    actuated |= {g[k] for g in sim["grippers"].values() for k in ("driver", "follower")}
    for joint_name in actuated:
        joint = spec.joint(joint_name)
        joint.armature = defaults["armature"]
        joint.damping = [defaults["damping"], 0, 0]

    for body in _subtree(spec.body(sim["gravcomp_root"])):
        body.gravcomp = 1.0

    base_bodies = set(base["bodies"])
    for geom in spec.geoms:
        if _is_collision_geom(geom):
            bits = COLLIDE_WORLD if geom.parent.name in base_bodies else COLLIDE_ALL
            geom.contype = geom.conaffinity = bits

    pad = sim["pad_contact"]
    pad_mu = priors.material(robot_spec["gripper"]["pad_material"])["friction"].value
    pad_bodies = {b for g in sim["grippers"].values() for b in g["pads"]}
    for geom in spec.geoms:
        if _is_collision_geom(geom) and geom.parent.name in pad_bodies:
            geom.condim = pad["condim"]
            geom.friction = [pad_mu, pad["torsional"], pad["rolling"]]
            geom.priority = pad["priority"]

    def actuator(name: str, joint_name: str):
        act = spec.add_actuator(name=name, target=joint_name, trntype=mujoco.mjtTrn.mjTRN_JOINT)
        if efforts.get(joint_name):  # torque/force limits from URDF effort
            act.forcelimited = _LIMITED
            act.forcerange = [-efforts[joint_name], efforts[joint_name]]
        return act

    for joint_name, kind in ((x, "lin"), (y, "lin"), (yaw, "ang")):
        act = actuator(joint_name, joint_name)
        act.set_to_velocity(kv=base["kv"][kind])
        act.ctrllimited = _LIMITED
        act.ctrlrange = [-base["ctrlrange"][kind], base["ctrlrange"][kind]]

    for group in sim["position_groups"].values():
        for joint_name in group["joints"]:
            joint = spec.joint(joint_name)
            act = actuator(joint_name, joint_name)
            act.set_to_position(kp=group["kp"], kv=group["kv"])
            act.ctrllimited = _LIMITED
            act.ctrlrange = list(joint.range)

    grip = sim["gripper_actuator"]
    for side, gripper in sim["grippers"].items():
        driver, follower = spec.joint(gripper["driver"]), spec.joint(gripper["follower"])
        spec.add_equality(type=mujoco.mjtEq.mjEQ_JOINT, name=f"{side}_gripper_mirror",
                          name1=follower.name, name2=driver.name, data=[0, -1] + [0] * 9)
        act = actuator(f"{side}_gripper", driver.name)
        act.set_to_position(kp=grip["kp"], kv=grip["kv"])
        act.ctrllimited = _LIMITED
        act.ctrlrange = list(driver.range)

    for camera_name, camera in robot_spec["cameras"].items():
        if camera.get("fovy_deg") is None:
            continue
        cam = spec.body(camera["link"]).add_camera(name=camera_name, quat=list(OPTICAL_TO_MUJOCO_CAMERA_QUAT),
                                                   fovy=camera["fovy_deg"])
        cam.resolution = camera["resolution"]

    names = {b.name for b in spec.bodies}
    for link1, link2 in srdf_pairs:
        if link1 in names and link2 in names:
            spec.add_exclude(bodyname1=link1, bodyname2=link2)


def _urdf_efforts(urdf_path: Path) -> dict[str, float]:
    efforts = {}
    for joint in ET.parse(urdf_path).getroot().findall("joint"):
        limit = joint.find("limit")
        if limit is not None and float(limit.get("effort", 0) or 0) > 0:
            efforts[joint.get("name")] = float(limit.get("effort"))
    return efforts


def keyframe_qpos(model: mujoco.MjModel, overrides: dict[str, float]) -> np.ndarray:
    qpos = model.qpos0.copy()
    for name, value in overrides.items():
        qpos[model.jnt_qposadr[model.joint(name).id]] = value
    for j in range(model.njnt):
        if model.jnt_limited[j] and int(model.jnt_type[j]) in _SCALAR_JOINTS:
            adr = model.jnt_qposadr[j]
            qpos[adr] = np.clip(qpos[adr], *model.jnt_range[j])
    return qpos


def ctrl_for_qpos(model: mujoco.MjModel, qpos: np.ndarray) -> np.ndarray:
    """Hold-in-place controls: position actuators target their joint's qpos, velocity actuators 0."""
    ctrl = np.zeros(model.nu)
    for i in range(model.nu):
        if model.actuator_biastype[i] == mujoco.mjtBias.mjBIAS_AFFINE and model.actuator_gainprm[i, 0] > 0:
            ctrl[i] = qpos[model.jnt_qposadr[model.actuator_trnid[i, 0]]]
    return ctrl


def add_keyframes(spec: mujoco.MjSpec, sim: dict) -> None:
    model = spec.compile()
    for key_name, overrides in sim["keyframes"].items():
        qpos = keyframe_qpos(model, overrides or {})
        spec.add_key(name=key_name, qpos=qpos.tolist(), ctrl=ctrl_for_qpos(model, qpos).tolist())


def build(name: str = "r1lite", force: bool = False) -> dict:
    robot_spec = load_robot_spec(name)
    sim = load_sim_config(name)
    fetch(name)
    robot_cache = cache_dir(name, robot_spec["variant"])
    out_xml = robot_cache / f"{name}.xml"

    spec = urdf_to_spec(robot_cache)
    decompose_collision(spec, robot_cache, sim["decompose_collision"], force=force)
    configure(spec, robot_spec, sim, srdf_disabled_pairs(robot_cache / "robot.srdf"),
              _urdf_efforts(robot_cache / "robot.urdf"))
    add_keyframes(spec, sim)
    xml = spec.to_xml()
    absolute_meshdir = f'meshdir="{robot_cache.resolve()}/"'
    if absolute_meshdir not in xml:
        absolute_meshdir = f'meshdir="{robot_cache.resolve()}"'
    assert xml.count(absolute_meshdir) == 1, "expected one meshdir in compiled MJCF"
    xml = xml.replace(absolute_meshdir, 'meshdir="."')  # portable: meshes resolve next to the MJCF
    if force or not out_xml.is_file() or out_xml.read_text() != xml:
        out_xml.write_text(xml)

    from .measure import measure

    model = mujoco.MjModel.from_xml_path(str(out_xml))
    result = {
        "robot": name,
        "variant": robot_spec["variant"],
        "mjcf": str(out_xml),
        "nq": model.nq,
        "nv": model.nv,
        "nu": model.nu,
        "nbody": model.nbody,
        "mass_kg": float(model.body_subtreemass[0]),
        "actuators": [model.actuator(i).name for i in range(model.nu)],
        "cameras": [model.camera(i).name for i in range(model.ncam)],
        "keyframes": [model.key(i).name for i in range(model.nkey)],
        "measured": measure(model, robot_spec, sim),
        "unverified_defaults": [
            "base velocity gains + ctrl ranges",
            "joint armature/damping",
            "gripper squeeze force = vendor_sim kp x finger error, capped by URDF effort",
        ],
    }
    (robot_cache / "build.json").write_text(json.dumps(result, indent=2) + "\n")
    return result
