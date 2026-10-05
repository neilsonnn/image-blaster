"""Indexed file convention, ported from .claude/scripts/asset-pipeline/request-metadata.mjs.

`N-slug.ext` artifacts and hidden `.N-slug[__scope]-request.json` request metadata.
Keep behavior in lockstep with the Node module; tests/test_paths.py checks parity.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

_REQUEST_RE = re.compile(r"^\.(\d+)-(.+?)(?:__([a-z0-9._-]+))?-request\.json$", re.IGNORECASE | re.ASCII)
_ARTIFACT_RE = re.compile(r"^(\d+)-(.+?)(\.[^.]+)$", re.ASCII)


@dataclass(frozen=True)
class IndexedName:
    index: int
    slug: str
    scope: str | None
    extension: str
    hidden: bool
    name: str
    path: str


def parse_indexed_name(value: str | os.PathLike | None) -> IndexedName | None:
    value = os.fspath(value) if value else ""
    file_name = os.path.basename(value)

    match = _REQUEST_RE.match(file_name)
    if match:
        return IndexedName(int(match[1]), match[2], match[3], ".json", True, file_name, value)

    match = _ARTIFACT_RE.match(file_name)
    if match:
        return IndexedName(int(match[1]), match[2], None, match[3], False, file_name, value)

    return None


def _indexed_entries(files_or_dir: str | os.PathLike | Iterable[str]) -> list[IndexedName]:
    if isinstance(files_or_dir, (str, os.PathLike)):
        directory = Path(files_or_dir)
        if not directory.is_dir():
            return []
        files = [str(p) for p in directory.iterdir() if p.is_file()]
    else:
        files = list(files_or_dir)
    return [parsed for parsed in map(parse_indexed_name, files) if parsed]


def next_index(files_or_dir, slug: str | None = None) -> int:
    indexes = [e.index for e in _indexed_entries(files_or_dir) if not slug or e.slug == slug]
    return max(indexes, default=-1) + 1


def latest_indexed(files_or_dir, slug: str | None = None, extensions: Iterable[str] | None = None) -> IndexedName | None:
    exts = {e.lower() for e in extensions} if extensions else None
    artifacts = [e for e in _indexed_entries(files_or_dir) if not e.hidden and (not slug or e.slug == slug)
                 and (exts is None or e.extension.lower() in exts)]
    return max(artifacts, key=lambda e: e.index, default=None)


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", str(value).lower())
    return value.strip("-")[:80]


def safe_file_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value)).strip("-")[:120]


def request_path(directory, index: int, slug: str, scope: str | None = None) -> Path:
    safe_scope = f"__{safe_file_name(scope)}" if scope else ""
    return Path(directory) / f".{index}-{safe_file_name(slug)}{safe_scope}-request.json"


def artifact_path(directory, index: int, slug: str, extension: str) -> Path:
    return Path(directory) / f"{index}-{safe_file_name(slug)}{extension}"


def repo_root(start: str | os.PathLike | None = None) -> Path:
    """Repo root: $BLASTSIM_ROOT, else the nearest ancestor holding both `.claude/` and `worlds/`."""
    if env := os.environ.get("BLASTSIM_ROOT"):
        return Path(env).resolve()
    here = Path(start or Path.cwd()).resolve()
    for candidate in (here, *here.parents):
        if (candidate / ".claude").is_dir() and (candidate / "worlds").is_dir():
            return candidate
    raise FileNotFoundError("could not find IMAGE-BLASTER repo root (set BLASTSIM_ROOT)")


@dataclass(frozen=True)
class WorldPaths:
    root: Path
    slug: str

    @property
    def world(self) -> Path:
        return self.root / "worlds" / self.slug

    @property
    def image_json(self) -> Path:
        return self.world / "image.json"

    @property
    def scene_json(self) -> Path:
        return self.world / "scene.json"

    @property
    def output(self) -> Path:
        return self.world / "output"

    @property
    def world_output(self) -> Path:
        return self.output / "world"

    @property
    def sim(self) -> Path:
        return self.world / "sim"

    def object_dir(self, object_id: str) -> Path:
        return self.output / object_id

    def object_sim_dir(self, object_id: str) -> Path:
        return self.object_dir(object_id) / "sim"

    def cousin_dir(self, object_id: str, cousin_slug: str) -> Path:
        """Cousins are sibling object dirs (`<parent>--<cousin>`) so every existing skill treats them as objects."""
        return self.output / f"{object_id}--{cousin_slug}"

    def object_ids(self) -> list[str]:
        if not self.output.is_dir():
            return []
        return sorted(p.parent.name for p in self.output.glob("*/object.json"))


def world_paths(slug: str, root: str | os.PathLike | None = None) -> WorldPaths:
    return WorldPaths(Path(root).resolve() if root else repo_root(), slug)
