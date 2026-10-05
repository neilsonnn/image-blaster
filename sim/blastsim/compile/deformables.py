"""Add deformables (MuJoCo flex) and flex-friendly support surfaces to a spec.

MuJoCo 3.14 keeps at most mjMAXCONPAIR = 50 contacts per (body, flex) pair, chosen by farthest-point sampling.
A dense cloth resting on one big box therefore sinks through it (measured: 24x24 cloth on a bed, 559/576 vertices
below the top). Supports under deformables are tiled into separate static bodies so every tile gets its own budget
(15 cm tiles: 0/576 vertices below the top). MuJoCo Warp exposes this cap at compile time (FLEX_MAXCONPAIR).
"""

from __future__ import annotations

from pathlib import Path

import mujoco
import numpy as np

from ..schemas import ClothPhysics, PhysicsFile, VolumetricPhysics
from . import COLLIDE_ALL
from .objects import contact_params

SUPPORT_TILE_M = 0.15


def add_tiled_support(spec: mujoco.MjSpec, name: str, center, half_extents, material_class: str = "generic_floor",
                      tile: float = SUPPORT_TILE_M, rgba=(0.25, 0.27, 0.35, 1.0)) -> list[str]:
    """A static box support split into tile bodies (see module docstring). Returns the tile body names."""
    contact = contact_params(material_class)
    center, half = np.asarray(center, float), np.asarray(half_extents, float)
    counts = np.maximum(np.ceil(2 * half[:2] / tile).astype(int), 1)
    tile_half = 2 * half[:2] / counts / 2
    names = []
    for i in range(counts[0]):
        for j in range(counts[1]):
            offset = -half[:2] + tile_half * (2 * np.array([i, j]) + 1)
            body_name = f"{name}_tile_{i}_{j}"
            body = spec.worldbody.add_body(name=body_name, pos=[*(center[:2] + offset), center[2]])
            body.add_geom(type=mujoco.mjtGeom.mjGEOM_BOX, size=[*tile_half, half[2]], contype=COLLIDE_ALL,
                          conaffinity=COLLIDE_ALL, friction=contact["friction"], solref=contact["solref"],
                          solimp=contact["solimp"], rgba=list(rgba))
            names.append(body_name)
    return names


def _contact_xml(material_class: str, selfcollide: str) -> str:
    c = contact_params(material_class)
    return (f'<contact condim="3" friction="{c["friction"][0]:.4g}" solref="{c["solref"][0]:.4g} {c["solref"][1]:.4g}" '
            f'solimp="{" ".join(f"{v:.4g}" for v in c["solimp"][:3])}" selfcollide="{selfcollide}" internal="false"/>')


def cloth_xml(name: str, mesh_file: Path, physics: ClothPhysics, sample: dict[str, float]) -> str:
    v = {k: sample.get(k, getattr(physics, k).value) for k in ("young_pa", "poisson", "thickness_m", "damping")}
    mass = sample.get("mass_kg", physics.mass_kg.value)
    radius = max(v["thickness_m"] / 2, 0.003)  # collision skin; thinner than ~3 mm tunnels at 2 ms steps
    selfcollide = "auto" if physics.self_collision else "none"
    return f"""<mujoco><worldbody>
<flexcomp name="{name}" type="mesh" file="{mesh_file.resolve()}" dim="2" radius="{radius:.4g}" mass="{mass:.6g}" rgba="0.92 0.92 0.92 1">
  {_contact_xml(physics.contact.material_class, selfcollide)}
  <edge equality="false" damping="{v["damping"]:.4g}"/>
  <elasticity young="{v["young_pa"]:.6g}" poisson="{v["poisson"]:.4g}" thickness="{v["thickness_m"]:.4g}" damping="{v["damping"]:.4g}" elastic2d="both"/>
</flexcomp></worldbody></mujoco>"""


def volumetric_xml(name: str, physics: VolumetricPhysics, sample: dict[str, float]) -> str:
    params = physics.template_params
    size = [params["size_x"], params["size_y"], params["size_z"]]
    counts = [params["count_x"], params["count_y"], params["count_z"]]
    spacing = [s / (c - 1) for s, c in zip(size, counts)]
    v = {k: sample.get(k, getattr(physics, k).value) for k in ("young_pa", "poisson", "damping")}
    mass = sample.get("mass_kg", physics.mass_kg.value)
    # flexcomp grids are centered on the frame; lift by half height so the object frame origin is the bottom-center
    return f"""<mujoco><worldbody>
<flexcomp name="{name}" type="grid" count="{" ".join(map(str, counts))}" spacing="{" ".join(f"{s:.5g}" for s in spacing)}"
  pos="0 0 {size[2] / 2:.5g}" dim="3" radius="0.005" mass="{mass:.6g}" rgba="0.9 0.9 0.92 1">
  {_contact_xml(physics.contact.material_class, "none")}
  <elasticity young="{v["young_pa"]:.6g}" poisson="{v["poisson"]:.4g}" damping="{v["damping"]:.4g}"/>
</flexcomp></worldbody></mujoco>"""


def add_deformable(spec: mujoco.MjSpec, world_dir: Path, physics_file: PhysicsFile, name: str,
                   pos=(0.0, 0.0, 0.0), quat=(1.0, 0.0, 0.0, 0.0), sample: dict[str, float] | None = None) -> str:
    """Attach the object's flex under a frame at pos/quat. Returns the compiled flex name (`<name>/<name>`)."""
    physics = physics_file.physics
    sample = sample or {}
    if isinstance(physics, ClothPhysics):
        xml = cloth_xml(name, world_dir / physics.mesh, physics, sample)
    elif isinstance(physics, VolumetricPhysics):
        xml = volumetric_xml(name, physics, sample)
    else:
        raise TypeError(f"{name}: no flex template for {physics.sim_class}")
    frame = spec.worldbody.add_frame(pos=list(pos), quat=list(quat))
    spec.attach(mujoco.MjSpec.from_string(xml), prefix=f"{name}/", frame=frame)
    return f"{name}/{name}"
