"""Physics pass for cloth and soft volumes: preset priors + a procedural template at a known resolution.

The generated glb only serves as the visual reference for deformables; geometry for the solver comes from
`templates.py`, sized from `sim.flat_size_m` (cloth) or `sim.size_m` (volumes).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .. import priors
from ..paths import WorldPaths, latest_indexed, next_index
from ..schemas import ClothPhysics, ContactSpec, ObjectSim, Param, PhysicsFile, SimClass, VolumetricPhysics
from .templates import LAYERS, cloth_mesh, grid_counts, spacing_for_budget

CLOTH_VERTEX_BUDGET = 500  # ~3 cm on a t-shirt; CPU MuJoCo runs ~0.2x realtime at this size
VOLUME_SPACING_M = 0.08


def _scaled(param: Param, factor: float, unit: str) -> Param:
    return Param(value=param.value * factor, low=param.low * factor, high=param.high * factor, unit=unit,
                 source=param.source)


def default_template(sim: ObjectSim) -> str:
    if sim.deformable_template:
        return sim.deformable_template
    if sim.sim_class == SimClass.VOLUMETRIC:
        return "box"
    return "tshirt" if sim.deformable_preset == "cotton_tshirt" else "rect"


def build_physics(world: str, object_id: str, sim: ObjectSim, out_dir: Path, index: int) -> tuple[PhysicsFile, dict]:
    kind = sim.sim_class.value.split(".", 1)[1]
    preset = priors.deformable_preset(kind, sim.deformable_preset)
    template = default_template(sim)
    material_class = sim.material_class or preset["material_class"]
    contact = ContactSpec(material_class=material_class)

    if sim.sim_class == SimClass.CLOTH:
        width, length = sim.flat_size_m or sim.size_m[:2]
        area_guess = width * length * (0.7 if template == "tshirt" else 1.0)
        spacing = spacing_for_budget(area_guess, CLOTH_VERTEX_BUDGET)
        mesh = cloth_mesh(template, width, length, spacing)
        mesh_path = out_dir / f"{index}-{object_id}-cloth.obj"
        mesh.export(mesh_path)
        layers = LAYERS[template]
        areal = _scaled(preset["areal_density_kg_m2"], layers, "kg/m^2")
        mass = _scaled(areal, mesh.area, "kg")
        physics = ClothPhysics(
            preset=sim.deformable_preset, template=template,
            template_params={"width_m": width, "length_m": length, "spacing_m": spacing, "layers": layers,
                             "vertices": len(mesh.vertices), "faces": len(mesh.faces)},
            mesh=str(mesh_path.relative_to(out_dir.parents[2])), mass_kg=mass,
            areal_density_kg_m2=areal, young_pa=_scaled(preset["young_pa"], layers, "Pa"), poisson=preset["poisson"],
            thickness_m=preset["thickness_m"], damping=preset["damping"], self_collision=True, contact=contact)
        summary = {"template": template, "vertices": len(mesh.vertices), "spacing_m": spacing, "area_m2": mesh.area}
    else:
        size = tuple(sim.size_m)
        counts = grid_counts(size, VOLUME_SPACING_M, min_count=3)
        mass = _scaled(preset["density_kg_m3"], float(np.prod(size)), "kg")
        physics = VolumetricPhysics(
            preset=sim.deformable_preset, template=template,
            template_params={"size_x": size[0], "size_y": size[1], "size_z": size[2],
                             "count_x": counts[0], "count_y": counts[1], "count_z": counts[2]},
            mass_kg=mass, density_kg_m3=preset["density_kg_m3"], young_pa=preset["young_pa"],
            poisson=preset["poisson"], damping=preset["damping"], contact=contact)
        summary = {"template": template, "grid": counts, "vertices": int(np.prod(counts))}
    summary["mass_kg"] = [mass.low, mass.value, mass.high]
    return PhysicsFile(world=world, object_id=object_id, physics=physics), summary


def process_deformable(wp: WorldPaths, object_id: str, record: dict, sim: ObjectSim, force: bool = False) -> dict:
    sim_dir = wp.object_sim_dir(object_id)
    previous = latest_indexed(sim_dir, f"{object_id}-physics", [".json"])
    fingerprint = sim.model_dump(mode="json")
    if previous and not force:
        old = json.loads(Path(previous.path).read_text())
        if old.get("provenance", {}).get("sim") == fingerprint:
            return {"object": object_id, "status": "up_to_date"}
    sim_dir.mkdir(parents=True, exist_ok=True)
    index = next_index(sim_dir, f"{object_id}-physics")
    physics_file, summary = build_physics(wp.slug, object_id, sim, sim_dir, index)
    reference = latest_indexed(wp.object_dir(object_id), object_id, (".png", ".jpg", ".webp"))
    physics_file.provenance = {
        "sim": fingerprint,
        "visual_reference": str(Path(reference.path).relative_to(wp.world)) if reference else None,
        "note": "solver geometry is procedural; the generated glb is a visual reference only",
    }
    path = sim_dir / f"{index}-{object_id}-physics.json"
    path.write_text(physics_file.model_dump_json(indent=2) + "\n")
    return {"object": object_id, "status": "processed", "index": index,
            "physics": str(path.relative_to(wp.world)), **summary}
