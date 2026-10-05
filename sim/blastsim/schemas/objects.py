"""Sim-facing object identity: the `sim` block in object.json, cousins, and affordances."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import Model, Pose, SimClass, Vec3

RelationType = Literal["on", "in", "attached_to", "draped_over", "part_of", "near"]


class Relation(Model):
    type: RelationType
    target: str  # object id, or a static/support id such as "floor", "counter-1"


class CousinInfo(Model):
    """`object.cousin` in a cousin's object.json. Cousins are ordinary objects in `output/<parent>--<cousin>/`,
    so the existing 3D/SFX skills and the viewer work on them unchanged."""

    parent_object: str
    kind: Literal["appearance", "functional"]
    generator: Literal["generative", "procedural", "retrieval"]
    prompt: str | None = None  # image-edit prompt for generative cousins
    params: dict[str, float | int | str | bool] = Field(default_factory=dict)
    seed: int | None = None


COUSIN_SEPARATOR = "--"


def cousin_id(parent_object: str, cousin_slug: str) -> str:
    return f"{parent_object}{COUSIN_SEPARATOR}{cousin_slug}"


class ObjectSim(Model):
    """Written by uncover into `object.json` under `object.sim` (and `image.json` objects[].sim)."""

    sim_class: SimClass
    material_class: str  # key in blastsim/priors/materials.yaml
    mass_kind: Literal["solid", "shell", "container"] | None = None  # rigid only
    size_m: Vec3 | None = None  # estimated bounding box (width, depth, height) in meters
    size_confidence: Literal["low", "medium", "high"] = "low"
    deformable_preset: str | None = None  # key in priors/deformables.yaml
    deformable_template: Literal["rect", "tshirt", "box"] | None = None  # cloth outline or soft-body shape
    flat_size_m: tuple[float, float] | None = None  # cloth only: laid-flat (width, length); size_m is as seen
    articulation_template: str | None = None  # cabinet, drawer, hinged-door, fridge, oven, laptop, ...
    built_in: bool = False  # fixture embedded in the world; must be removed from the plate
    relations: list[Relation] = Field(default_factory=list)


class Affordance(Model):
    kind: Literal["grasp", "handle", "opening", "support_surface", "fold_corner", "edge", "insert_slot"]
    name: str
    frame: Pose  # in the object's sim-local frame
    width_m: float | None = None  # grasp aperture needed
    approach: Vec3 | None = None
    link: str | None = None  # articulated link it belongs to


class AffordancesFile(Model):
    schema_version: Literal[1] = 1
    world: str
    object_id: str
    cousin: str | None = None
    affordances: list[Affordance]
