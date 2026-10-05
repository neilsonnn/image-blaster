"""Physics pass for rigid/static objects: generated glb -> metric, z-up, collision hulls, mass/inertia, grasps.

Outputs share one index N in `output/<obj>/sim/`:
  N-<obj>-physics.json      PhysicsFile (ranged params + provenance)
  N-<obj>-affordances.json  AffordancesFile
  N-<obj>-collision/        CoACD convex hulls (hull_XX.obj)
  N-<obj>-visual/           scaled z-up visual mesh (+ texture)
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import trimesh
from trimesh.exchange.obj import export_obj

from .. import priors
from ..geometry import convex_decompose
from ..paths import WorldPaths, latest_indexed, next_index
from ..robots import load_robot_spec
from ..schemas import AffordancesFile, ContactSpec, ObjectSim, PhysicsFile, RigidPhysics, SimClass
from .affordances import grasp_affordances, support_affordance
from .mass import full_inertia, mass_properties
from .mesh import load_asset_z_up, metric_scale, repair

MODEL_EXTENSIONS = (".glb", ".gltf")
COACD = {"threshold": 0.05, "max_hulls": 12, "max_faces": 6000}
ASPECT_WARNING = 1.5
GRASP_CLEARANCE_M = 0.01  # total free space wanted around the object inside the open fingers


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _rel(wp: WorldPaths, path: Path) -> str:
    return str(path.relative_to(wp.world))


def export_visual(mesh: trimesh.Trimesh, out_dir: Path) -> tuple[Path, Path | None]:
    out_dir.mkdir(parents=True, exist_ok=True)
    text, extra = export_obj(mesh, include_texture=True, return_texture=True, mtl_name="visual.mtl")
    obj = out_dir / "visual.obj"
    obj.write_text(text)
    texture = None
    for name, data in extra.items():
        (out_dir / name).write_bytes(data)
        if name.lower().endswith((".png", ".jpg", ".jpeg")):
            texture = out_dir / name
    return obj, texture


def _latest_physics(sim_dir: Path, object_id: str) -> dict | None:
    latest = latest_indexed(sim_dir, f"{object_id}-physics", [".json"])
    return json.loads(Path(latest.path).read_text()) if latest else None


def _gripper_width(robot: str) -> float | None:
    width = load_robot_spec(robot)["gripper"].get("max_open_width_m")
    return width.get("value") if isinstance(width, dict) else width


def process_object(wp: WorldPaths, object_id: str, force: bool = False, robot: str = "r1lite") -> dict:
    object_dir = wp.object_dir(object_id)
    record = json.loads((object_dir / "object.json").read_text())["object"]
    summary: dict = {"object": object_id}
    if "sim" not in record:
        return summary | {"status": "skipped", "reason": "object.json has no sim block (re-run uncover)"}
    sim = ObjectSim.model_validate(record["sim"])
    if sim.sim_class in (SimClass.CLOTH, SimClass.VOLUMETRIC):
        from ..deformables.process import process_deformable

        return process_deformable(wp, object_id, record, sim, force=force)
    if sim.sim_class not in (SimClass.RIGID, SimClass.STATIC):
        return summary | {"status": "skipped", "reason": f"{sim.sim_class.value} templates are not built yet"}
    if not sim.size_m:
        return summary | {"status": "skipped", "reason": "sim.size_m missing: metric scale needs a size estimate"}
    model = latest_indexed(object_dir, object_id, MODEL_EXTENSIONS)
    if model is None:
        return summary | {"status": "skipped", "reason": "no generated model yet (run the 3D skill first)"}

    model_path = Path(model.path)
    source_sha = _sha256(model_path)
    sim_dir = wp.object_sim_dir(object_id)
    previous = _latest_physics(sim_dir, object_id)
    if previous and not force and previous.get("provenance", {}).get("source_sha256") == source_sha \
            and previous.get("provenance", {}).get("size_m_estimate") == list(sim.size_m):
        return summary | {"status": "up_to_date", "physics": previous}

    mesh = repair(load_asset_z_up(model_path))
    scale = metric_scale(mesh.extents, sim.size_m)
    mesh.apply_scale(scale.factor)

    material = priors.material(sim.material_class)
    mass_kind = sim.mass_kind or "solid"
    thickness = material.get("shell_thickness_m")
    notes: list[str] = []
    if mass_kind != "solid" and thickness is None:
        notes.append(f"{sim.material_class} has no shell thickness prior; treated as solid")
        mass_kind = "solid"
    props = mass_properties(mesh, mass_kind, material["density_kg_m3"], thickness if mass_kind != "solid" else None)

    if scale.aspect_mismatch > ASPECT_WARNING:
        notes.append(f"generated shape disagrees with size_m by {scale.aspect_mismatch:.2f}x across axes; "
                     "check size_m or regenerate the model")

    index = next_index(sim_dir, f"{object_id}-physics")
    collision_dir = sim_dir / f"{index}-{object_id}-collision"
    collision_dir.mkdir(parents=True, exist_ok=True)
    hulls = convex_decompose(mesh, **COACD)
    for i, hull in enumerate(hulls):
        hull.export(collision_dir / f"hull_{i:02d}.obj")
    visual, texture = export_visual(mesh, sim_dir / f"{index}-{object_id}-visual")

    grasps = grasp_affordances(mesh, cavity=props.cavity)
    support = support_affordance(mesh)
    affordances = AffordancesFile(world=wp.slug, object_id=object_id, affordances=grasps + ([support] if support else []))
    (sim_dir / f"{index}-{object_id}-affordances.json").write_text(affordances.model_dump_json(indent=2) + "\n")

    physics = PhysicsFile(
        world=wp.slug,
        object_id=object_id,
        cousin=(record.get("cousin") or {}).get("parent_object"),
        physics=RigidPhysics(
            sim_class=sim.sim_class.value,
            mass_kind=mass_kind,
            shell_thickness_m=thickness if mass_kind != "solid" else None,
            mass_kg=props.mass,
            com=tuple(float(v) for v in props.com),
            inertia=full_inertia(props.inertia),
            size_m=tuple(float(v) for v in mesh.extents),
            contact=ContactSpec(material_class=sim.material_class, restitution=material["restitution"],
                                condim=4 if sim.sim_class == SimClass.RIGID else 3),
            collision_dir=_rel(wp, collision_dir),
            visual=_rel(wp, visual),
        ),
        provenance={
            "source": _rel(wp, model_path),
            "source_sha256": source_sha,
            "size_m_estimate": list(sim.size_m),
            "size_confidence": sim.size_confidence,
            "scale_factor": scale.factor,
            "scale_ratios": list(scale.ratios),
            "aspect_mismatch": scale.aspect_mismatch,
            "filled_volume_m3": props.filled_volume_m3,
            "hull_volume_m3": props.hull_volume_m3,
            "area_m2": props.area_m2,
            "cavity_detected": props.cavity,
            "watertight": bool(mesh.is_watertight),
            "hulls": len(hulls),
            "coacd": COACD,
            "texture": _rel(wp, texture) if texture else None,
        },
        notes=notes,
    )
    physics_path = sim_dir / f"{index}-{object_id}-physics.json"
    physics_path.write_text(physics.model_dump_json(indent=2) + "\n")

    max_open = _gripper_width(robot)
    fitting = [g.name for g in grasps if max_open and g.width_m is not None and g.width_m + GRASP_CLEARANCE_M <= max_open]
    return summary | {
        "status": "processed",
        "index": index,
        "physics": _rel(wp, physics_path),
        "mass_kg": [props.mass.low, props.mass.value, props.mass.high],
        "size_m": [float(v) for v in mesh.extents],
        "hulls": len(hulls),
        "grasps": {g.name: g.width_m for g in grasps},
        f"grasps_fitting_{robot}": fitting,
        "notes": notes,
    }
