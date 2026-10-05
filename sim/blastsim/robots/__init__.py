"""Robot specs. Values must come from the vendor's URDF/docs (record them in `source`), never from memory."""

from __future__ import annotations

import json
from importlib.resources import files
from typing import Any


def load_robot_spec(name: str) -> dict[str, Any]:
    path = files(__package__).joinpath(name, "spec.json")
    if not path.is_file():
        raise KeyError(f"unknown robot {name!r}")
    return json.loads(path.read_text())


def missing_fields(spec: dict[str, Any], prefix: str = "") -> list[str]:
    """Dotted paths of every null leaf: the facts still needed before validators can trust the spec."""
    missing = []
    for key, value in spec.items():
        dotted = f"{prefix}{key}"
        if value is None:
            missing.append(dotted)
        elif isinstance(value, dict):
            missing.extend(missing_fields(value, f"{dotted}."))
    return missing
