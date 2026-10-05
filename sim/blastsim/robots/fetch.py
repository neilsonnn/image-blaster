"""Fetch pinned vendor robot files into a gitignored cache (never committed: the URDF repo has no license)."""

from __future__ import annotations

import hashlib
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

from . import load_robot_spec

RAW = "https://raw.githubusercontent.com/{repo}/{commit}/{path}"


def cache_dir(name: str, variant: str) -> Path:
    return Path(__file__).resolve().parents[2] / ".cache" / "robots" / name / variant


def _download(url: str, dest: Path) -> str:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read()
    dest.write_bytes(data)
    return hashlib.sha256(data).hexdigest()


def _source_url(source: dict, path: str) -> str:
    return RAW.format(repo=source["repo"], commit=source["commit"], path=path)


def mesh_refs(urdf_path: Path) -> list[tuple[str, str]]:
    """(kind, file) for every URDF mesh, kind is the package subfolder: `meshes` or `collision_meshes`."""
    root = ET.parse(urdf_path).getroot()
    refs = {tuple(m.get("filename").rsplit("/", 2)[-2:]) for m in root.iter("mesh")}
    return sorted(refs)


def vendor_mesh_name(kind: str, file_name: str) -> str:
    """Official URDF `collision_meshes/X.STL` ships as `X_collision.STL` in GalaxeaManipSim."""
    return file_name if kind == "meshes" else file_name.replace(".STL", "_collision.STL")


def fetch(name: str = "r1lite", force: bool = False) -> dict:
    spec = load_robot_spec(name)
    variant = spec["variant"]
    sources = spec["source"]
    out = cache_dir(name, variant)
    manifest_path = out / "manifest.json"
    if manifest_path.is_file() and not force:
        return json.loads(manifest_path.read_text())

    files: dict[str, str] = {}
    urdf_src = sources["urdf"]
    urdf_path = out / "robot.urdf"
    files["robot.urdf"] = _download(_source_url(urdf_src, urdf_src["path"]), urdf_path)

    srdf_src = sources["srdf"]
    files["robot.srdf"] = _download(_source_url(srdf_src, srdf_src["path"]), out / "robot.srdf")

    mesh_src = sources["meshes"]
    for kind, file_name in mesh_refs(urdf_path):
        local = f"{kind}/{file_name}"
        remote = f"{mesh_src['path']}/{vendor_mesh_name(kind, file_name)}"
        files[local] = _download(_source_url(mesh_src, remote), out / local)

    manifest = {
        "robot": name,
        "variant": variant,
        "retrieved_at": date.today().isoformat(),
        "sources": sources,
        "files": files,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
