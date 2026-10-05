"""Task cousins (L3) and trajectory cousins (L4)."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import Model

TaskTemplate = Literal[
    "pick_place",
    "open",
    "close",
    "insert",
    "wipe",
    "fold",
    "drape",
    "route_cable",
    "nav_to",
    "nav_then_pick_place",
]


class Predicate(Model):
    """BDDL-style atom, e.g. {"name": "in", "args": ["mug", "sink"]} or {"name": "open", "args": ["drawer_2"], "threshold": 0.2}."""

    name: str
    args: list[str]
    threshold: float | None = None
    negated: bool = False


class TaskFile(Model):
    schema_version: Literal[1] = 1
    world: str
    task: str
    template: TaskTemplate
    scene: str  # scene-cousin slug
    robot: str = "r1lite"
    parent: str | None = None  # task-cousin parent
    seed: int | None = None
    language: str  # instruction
    init: list[Predicate] = Field(default_factory=list)
    goal: list[Predicate]
    params: dict[str, float | int | str | bool] = Field(default_factory=dict)
    horizon_s: float = 60.0


TrajectoryMethod = Literal["scripted", "motion_planning", "rl", "teleop", "policy"]


class EpisodeMeta(Model):
    episode: str
    seed: int | None = None
    success: bool
    steps: int
    duration_s: float
    physics_sample: dict[str, float] = Field(default_factory=dict)  # domain-randomized params actually used
    fallbacks: list[str] = Field(default_factory=list)  # e.g. "cloth_grasp_weld"
    file: str  # relative path to episode data


class TrajectorySetFile(Model):
    """`sim/trajectories/<task-cousin>/N-<method>.json`."""

    schema_version: Literal[1] = 1
    world: str
    task: str
    method: TrajectoryMethod
    method_params: dict[str, float | int | str | bool] = Field(default_factory=dict)
    episodes: list[EpisodeMeta] = Field(default_factory=list)
