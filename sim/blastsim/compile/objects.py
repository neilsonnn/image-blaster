"""Add processed objects (PhysicsFile) to a MuJoCo spec. Shared by validators and the scene compiler."""

from __future__ import annotations

from pathlib import Path

import mujoco

from .. import priors
from ..schemas import PhysicsFile, RigidPhysics
from . import COLLIDE_ALL

# Contact softness presets: solref (timeconst, dampratio) timeconst >= 2x timestep; solimp (dmin, dmax, width).
CONTACT_PRESETS = {
    "stiff": {"timeconst": 0.004, "solimp": [0.95, 0.99, 0.001, 0.5, 2.0]},
    "medium": {"timeconst": 0.008, "solimp": [0.9, 0.95, 0.002, 0.5, 2.0]},
    "soft": {"timeconst": 0.02, "solimp": [0.8, 0.9, 0.005, 0.5, 2.0]},
}
TORSIONAL_FRICTION = 0.005
ROLLING_FRICTION = 0.0001


def contact_params(material_class: str) -> dict:
    """Per-material MuJoCo contact parameters.

    Contacts are critically damped (dampratio 1). Restitution stays a recorded Param but is not mapped: MuJoCo's soft
    contacts have no velocity-dependent restitution, and an underdamped contact spring makes resting objects chatter
    forever (measured: a ceramic mug at dampratio 0.36 never settled in 3 s; at 1.0 it rests on 4 contacts).
    """
    material = priors.material(material_class)
    preset = CONTACT_PRESETS[material["contact"]]
    return {
        "friction": [material["friction"].value, TORSIONAL_FRICTION, ROLLING_FRICTION],
        "solref": [preset["timeconst"], 1.0],
        "solimp": preset["solimp"],
    }


def add_rigid_object(spec: mujoco.MjSpec, world_dir: Path, physics_file: PhysicsFile, name: str,
                     pos=(0.0, 0.0, 0.0), quat=(1.0, 0.0, 0.0, 0.0), parent: mujoco.MjsBody | None = None,
                     sample: dict[str, float] | None = None) -> mujoco.MjsBody:
    """One body: free joint (rigid) or fixed (static), explicit inertial, CoACD hull collision, textured visual.

    `sample` overrides nominal values for domain randomization (keys: mass_kg, friction).
    """
    physics = physics_file.physics
    if not isinstance(physics, RigidPhysics):
        raise TypeError(f"{name}: add_rigid_object needs RigidPhysics, got {physics.sim_class}")
    sample = sample or {}
    body = (parent or spec.worldbody).add_body(name=name, pos=list(pos), quat=list(quat))
    if physics.sim_class == "rigid":
        body.add_freejoint(name=f"{name}_free")

    nominal_mass = physics.mass_kg.value
    mass = sample.get("mass_kg", nominal_mass)
    body.explicitinertial = True
    body.mass = mass
    body.ipos = list(physics.com)
    body.fullinertia = [v * mass / nominal_mass for v in physics.inertia]

    contact = contact_params(physics.contact.material_class)
    if "friction" in sample:
        contact["friction"][0] = sample["friction"]

    hull_dir = world_dir / physics.collision_dir
    for i, hull in enumerate(sorted(hull_dir.glob("hull_*.obj"))):
        mesh_name = f"{name}_hull{i:02d}"
        spec.add_mesh(name=mesh_name, file=str(hull.resolve()))
        body.add_geom(name=mesh_name, type=mujoco.mjtGeom.mjGEOM_MESH, meshname=mesh_name,
                      contype=COLLIDE_ALL, conaffinity=COLLIDE_ALL, condim=physics.contact.condim,
                      friction=contact["friction"], solref=contact["solref"], solimp=contact["solimp"],
                      group=3, density=0, rgba=[0.8, 0.3, 0.3, 0.4])

    if physics.visual:
        visual = (world_dir / physics.visual).resolve()
        spec.add_mesh(name=f"{name}_visual", file=str(visual))
        geom = body.add_geom(name=f"{name}_visual", type=mujoco.mjtGeom.mjGEOM_MESH, meshname=f"{name}_visual",
                             contype=0, conaffinity=0, group=2, density=0)
        texture = physics_file.provenance.get("texture")
        if texture:
            spec.add_texture(name=f"{name}_tex", type=mujoco.mjtTexture.mjTEXTURE_2D,
                             file=str((world_dir / texture).resolve()))
            material = spec.add_material(name=f"{name}_mat")
            material.textures[mujoco.mjtTextureRole.mjTEXROLE_RGB] = f"{name}_tex"
            geom.material = f"{name}_mat"
    return body
