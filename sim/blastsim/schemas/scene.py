"""Canonical scene graph (z-up, metric) and validation reports."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from .common import Model, Pose, Vec3
from .objects import RelationType


class SupportSurface(Model):
    id: str
    kind: Literal["floor", "plane", "box"]
    pose: Pose
    extent_m: Vec3  # half extents; z ~0 for planes
    material_class: str = "generic_floor"


class SceneNode(Model):
    id: str
    kind: Literal["world", "support", "object", "robot"]
    object_id: str | None = None  # output/<object_id>
    cousin: str | None = None  # None -> the base object
    pose: Pose = Field(default_factory=Pose)
    fixed: bool = False


class SceneEdge(Model):
    type: RelationType
    src: str
    dst: str


class SceneGraph(Model):
    schema_version: Literal[1] = 1
    world: str
    parent: str | None = None  # scene-cousin parent graph
    seed: int | None = None
    world_collider: str | None = None  # output/world/N-world.glb, used for nav only
    supports: list[SupportSurface] = Field(default_factory=list)
    nodes: list[SceneNode]
    edges: list[SceneEdge] = Field(default_factory=list)

    @model_validator(mode="after")
    def _edges_reference_nodes(self):
        ids = {n.id for n in self.nodes} | {s.id for s in self.supports}
        if len(ids) != len(self.nodes) + len(self.supports):
            raise ValueError("duplicate node/support id")
        for edge in self.edges:
            missing = {edge.src, edge.dst} - ids
            if missing:
                raise ValueError(f"edge {edge.type} references unknown ids {sorted(missing)}")
        return self


class CheckResult(Model):
    name: str
    passed: bool
    value: float | None = None
    threshold: float | None = None
    detail: str | None = None
    subject: str | None = None


class ValidationReport(Model):
    schema_version: Literal[1] = 1
    world: str
    scene: str
    robot: str | None = None
    passed: bool
    checks: list[CheckResult]
