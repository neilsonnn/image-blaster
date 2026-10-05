"""Per-object physics specs, one variant per sim class. Written to `sim/N-<obj>-physics.json`."""

from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import Field

from .common import Model, Param, Vec3


class ContactSpec(Model):
    """Contact material. Friction is a pair property: resolved against the other material via priors."""

    material_class: str
    restitution: Param | None = None
    condim: Literal[1, 3, 4, 6] = 3  # 4/6 adds torsional/rolling friction for graspables


class RigidPhysics(Model):
    sim_class: Literal["rigid", "static"] = "rigid"
    mass_kind: Literal["solid", "shell", "container"] = "solid"
    shell_thickness_m: Param | None = None
    mass_kg: Param
    com: Vec3 = (0.0, 0.0, 0.0)
    # full inertia about the com in the object frame, kg m^2: (ixx, iyy, izz, ixy, ixz, iyz), MuJoCo `fullinertia` order
    inertia: tuple[float, float, float, float, float, float] | None = None
    size_m: Vec3 | None = None  # bounding box after metric scaling (x, y, z), object frame z-up
    contact: ContactSpec
    collision_dir: str | None = None  # relative to the world dir: `output/<obj>/sim/N-<obj>-collision/`
    visual: str | None = None  # relative to the world dir: scaled z-up visual mesh


class JointSpec(Model):
    name: str
    type: Literal["revolute", "prismatic", "continuous", "fixed"]
    parent: str
    child: str
    axis: Vec3
    origin: Vec3 = (0.0, 0.0, 0.0)
    limit: tuple[float, float] | None = None  # rad or m
    damping: Param | None = None
    frictionloss: Param | None = None
    armature: Param | None = None
    stiffness: Param | None = None  # spring (self-closing doors, soft-close drawers)
    springref: float | None = None
    detent_force: Param | None = None  # N or N m to break a latch / magnetic seal


class LinkSpec(Model):
    name: str
    mass_kg: Param
    contact: ContactSpec
    visual: str | None = None
    collision_dir: str | None = None


class ArticulatedPhysics(Model):
    sim_class: Literal["articulated"] = "articulated"
    template: str
    template_params: dict[str, float | int | str | bool] = Field(default_factory=dict)
    root_fixed: bool = True  # built-in fixture vs free-standing (laptop, box with lid)
    links: list[LinkSpec]
    joints: list[JointSpec]


class ClothPhysics(Model):
    sim_class: Literal["deformable.cloth"] = "deformable.cloth"
    preset: str
    template: str = "rect"  # outline: rect, tshirt
    template_params: dict[str, float | int | str | bool] = Field(default_factory=dict)  # flat size, spacing
    mesh: str | None = None  # relative to the world dir: flat triangle mesh, object frame
    mass_kg: Param | None = None  # areal density x mesh area
    areal_density_kg_m2: Param
    young_pa: Param
    poisson: Param
    thickness_m: Param
    damping: Param
    self_collision: bool = True
    contact: ContactSpec


class CablePhysics(Model):
    sim_class: Literal["deformable.cable"] = "deformable.cable"
    preset: str
    radius_m: Param
    density_kg_m3: Param
    bend_pa: Param
    twist_pa: Param
    contact: ContactSpec


class VolumetricPhysics(Model):
    sim_class: Literal["deformable.volumetric"] = "deformable.volumetric"
    preset: str
    template: str = "box"
    template_params: dict[str, float | int | str | bool] = Field(default_factory=dict)  # size, grid counts
    mass_kg: Param | None = None  # density x volume
    density_kg_m3: Param
    young_pa: Param
    poisson: Param
    damping: Param
    contact: ContactSpec


class PlasticPhysics(Model):
    sim_class: Literal["deformable.plastic"] = "deformable.plastic"
    preset: str
    density_kg_m3: Param
    young_pa: Param
    poisson: Param
    yield_stress_pa: Param


PhysicsSpec = Annotated[
    Union[RigidPhysics, ArticulatedPhysics, ClothPhysics, CablePhysics, VolumetricPhysics, PlasticPhysics],
    Field(discriminator="sim_class"),
]


class PhysicsFile(Model):
    schema_version: Literal[1] = 1
    world: str
    object_id: str
    cousin: str | None = None
    physics: PhysicsSpec
    provenance: dict[str, Any] = Field(default_factory=dict)  # source asset + hash, scale, processing params
    notes: list[str] = Field(default_factory=list)
