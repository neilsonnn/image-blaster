from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class SimClass(str, Enum):
    STATIC = "static"
    RIGID = "rigid"
    ARTICULATED = "articulated"
    CLOTH = "deformable.cloth"
    CABLE = "deformable.cable"
    VOLUMETRIC = "deformable.volumetric"
    PLASTIC = "deformable.plastic"

    @property
    def is_deformable(self) -> bool:
        return self.value.startswith("deformable.")


ParamSource = Literal["prior", "vlm", "measured", "sysid", "template"]


class Param(Model):
    """A physical parameter with its uncertainty, sampled for domain randomization.

    Never trust `value` alone: priors and VLM estimates are plausible, not true.
    """

    value: float
    low: float | None = None
    high: float | None = None
    dist: Literal["fixed", "uniform", "loguniform", "normal"] = "uniform"
    source: ParamSource = "prior"
    unit: str | None = None

    @model_validator(mode="after")
    def _check_range(self):
        if self.dist == "fixed":
            return self
        if self.low is None or self.high is None:
            raise ValueError("non-fixed Param needs low and high")
        if not self.low <= self.value <= self.high:
            raise ValueError(f"value {self.value} outside [{self.low}, {self.high}]")
        if self.dist == "loguniform" and self.low <= 0:
            raise ValueError("loguniform needs low > 0")
        return self

    def sample(self, rng) -> float:
        if self.dist == "fixed":
            return self.value
        if self.dist == "loguniform":
            import math

            return math.exp(rng.uniform(math.log(self.low), math.log(self.high)))
        if self.dist == "normal":
            sigma = (self.high - self.low) / 4
            return float(min(max(rng.normal(self.value, sigma), self.low), self.high))
        return float(rng.uniform(self.low, self.high))


Vec3 = tuple[float, float, float]
Quat = tuple[float, float, float, float]  # (w, x, y, z)


class Pose(Model):
    """Sim frame pose: z-up, meters, quaternion (w, x, y, z)."""

    pos: Vec3 = (0.0, 0.0, 0.0)
    quat: Quat = (1.0, 0.0, 0.0, 0.0)
