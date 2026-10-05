import json
import shutil
import subprocess
from pathlib import Path

import pytest

from blastsim.paths import artifact_path, latest_indexed, next_index, parse_indexed_name, request_path, slugify, world_paths

REPO = Path(__file__).resolve().parents[2]
FIXTURES = [
    "0-kitchen.jpg",
    "1-kitchen-plate.png",
    ".2-world-request.json",
    ".3-mug__model-request.json",
    ".3-mug__image-request.json",
    "12-world-full_res.spz",
    "2-scene.xml",
    "4-mug-physics.json",
    "no-index.png",
    "abc-1.png",
    ".hidden",
    "3-.png",
    ".1-Upper__Scope-request.json",
]


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_parse_parity_with_node():
    script = (
        "import { parseIndexedName } from './.claude/scripts/asset-pipeline/request-metadata.mjs';"
        f"const names = {json.dumps(FIXTURES)};"
        "console.log(JSON.stringify(names.map((n) => parseIndexedName(n) ?? null)));"
    )
    out = subprocess.run(["node", "--input-type=module", "-e", script], cwd=REPO, capture_output=True, text=True, check=True)
    for name, expected in zip(FIXTURES, json.loads(out.stdout)):
        parsed = parse_indexed_name(name)
        if expected is None:
            assert parsed is None, name
            continue
        assert parsed is not None, name
        assert (parsed.index, parsed.slug, parsed.scope, parsed.extension, parsed.hidden) == (
            expected["index"], expected["slug"], expected.get("scope"), expected["extension"], expected["hidden"]
        ), name


def test_next_and_latest():
    files = ["0-mug.glb", "1-mug.glb", ".2-mug__model-request.json", "5-bowl.glb"]
    assert next_index(files, "mug") == 3  # hidden requests reserve indexes
    assert latest_indexed(files, "mug").index == 1  # latest only counts visible artifacts
    assert next_index([], "mug") == 0
    assert next_index(files) == 6


def test_path_builders(tmp_path):
    assert request_path(tmp_path, 2, "mug", "model").name == ".2-mug__model-request.json"
    assert artifact_path(tmp_path, 4, "mug physics", ".json").name == "4-mug-physics.json"
    assert slugify("  Terracotta Amphora #2 ") == "terracotta-amphora-2"


def test_world_paths(tmp_path):
    (tmp_path / ".claude").mkdir()
    (tmp_path / "worlds" / "w" / "output" / "mug").mkdir(parents=True)
    (tmp_path / "worlds" / "w" / "output" / "mug" / "object.json").write_text("{}")
    wp = world_paths("w", tmp_path)
    assert wp.object_ids() == ["mug"]
    assert wp.cousin_dir("mug", "blue") == tmp_path / "worlds/w/output/mug--blue"
