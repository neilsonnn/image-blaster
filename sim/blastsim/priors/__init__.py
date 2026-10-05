"""Physics prior tables: materials, friction pairs, deformable presets. All values are ranged Params."""

from __future__ import annotations

import math
from functools import cache
from importlib.resources import files

import yaml

from ..schemas.common import Param

_LOG_KEYS = {"young_pa", "bend_pa", "twist_pa", "damping", "yield_stress_pa"}
DEFORMABLE_KINDS = ("cloth", "cable", "volumetric", "plastic")


def _param(key: str, triple) -> Param:
    value, low, high = (float(x) for x in triple)
    return Param(value=value, low=low, high=high, dist="loguniform" if key in _LOG_KEYS else "uniform", source="prior")


@cache
def _load(name: str) -> dict:
    return yaml.safe_load(files(__package__).joinpath(name).read_text())


def material_names() -> list[str]:
    return sorted(_load("materials.yaml")["materials"])


def material(name: str) -> dict[str, Param | str]:
    table = _load("materials.yaml")["materials"]
    if name not in table:
        raise KeyError(f"unknown material_class {name!r}; known: {', '.join(sorted(table))}")
    return {k: v if isinstance(v, str) else _param(k, v) for k, v in table[name].items()}


def friction(a: str, b: str) -> Param:
    """Pair friction: explicit override, else geometric mean of the two base coefficients and their bounds."""
    for pa, pb, value, low, high in _load("materials.yaml")["friction_pairs"]:
        if {pa, pb} == {a, b}:
            return Param(value=value, low=low, high=high, source="prior")
    fa, fb = material(a)["friction"], material(b)["friction"]
    return Param(
        value=math.sqrt(fa.value * fb.value),
        low=math.sqrt(fa.low * fb.low),
        high=math.sqrt(fa.high * fb.high),
        source="prior",
    )


def deformable_preset_names(kind: str) -> list[str]:
    return sorted(_load("deformables.yaml")[kind])


def deformable_preset(kind: str, name: str) -> dict[str, Param | str]:
    if kind not in DEFORMABLE_KINDS:
        raise KeyError(f"unknown deformable kind {kind!r}; known: {', '.join(DEFORMABLE_KINDS)}")
    table = _load("deformables.yaml")[kind]
    if name not in table:
        raise KeyError(f"unknown {kind} preset {name!r}; known: {', '.join(sorted(table))}")
    return {k: v if isinstance(v, str) else _param(k, v) for k, v in table[name].items()}
