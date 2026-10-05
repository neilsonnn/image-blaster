import json

import numpy as np
import pytest

from blastsim.cli import main
from blastsim.deformables.templates import cloth_mesh, spacing_for_budget, tshirt_outline


@pytest.mark.parametrize("template,width,length", [("tshirt", 0.75, 0.7), ("rect", 1.5, 2.0)])
def test_cloth_mesh_is_one_clean_sheet(template, width, length):
    spacing = 0.04
    mesh = cloth_mesh(template, width, length, spacing)
    corners = mesh.vertices[mesh.faces]
    edges = np.linalg.norm(corners - np.roll(corners, 1, axis=1), axis=2)
    assert edges.max() < 1.8 * spacing  # no long bridges across concave notches
    assert mesh.area_faces.min() > 0.05 * spacing**2  # no slivers (MuJoCo bending is singular on them)
    assert len(mesh.split(only_watertight=False)) == 1
    assert np.allclose(mesh.vertices[:, 2], 0) and np.ptp(mesh.vertices[:, 0]) == pytest.approx(width, rel=0.02)


def test_tshirt_outline_is_symmetric_and_sized():
    outline = tshirt_outline(0.75, 0.7)
    assert np.ptp(outline[:, 0]) == pytest.approx(0.75) and np.ptp(outline[:, 1]) == pytest.approx(0.7)
    np.testing.assert_allclose(sorted(outline[:, 0]), sorted(-outline[:, 0]), atol=1e-12)


def test_spacing_budget():
    spacing = spacing_for_budget(0.38, 500)
    assert 0.025 < spacing < 0.035
    assert spacing_for_budget(100.0, 10) == 0.10  # clamped
    assert spacing_for_budget(0.01, 5000) == 0.025  # resolution floor keeps the flex solve well conditioned


def _world(tmp_path, objects):
    (tmp_path / ".claude").mkdir()
    for object_id, sim in objects.items():
        obj_dir = tmp_path / "worlds" / "w" / "output" / object_id
        obj_dir.mkdir(parents=True)
        record = {"id": object_id, "name": object_id, "sim": sim}
        (obj_dir / "object.json").write_text(json.dumps({"schema_version": 1, "world": "w", "object": record}))
    return tmp_path


def test_deformable_pass_and_settle(tmp_path, capsys):
    root = _world(tmp_path, {
        "shirt": {"sim_class": "deformable.cloth", "material_class": "fabric_cotton", "deformable_preset": "cotton_tshirt",
                  "deformable_template": "tshirt", "size_m": [0.5, 0.45, 0.01]},
        "pillow": {"sim_class": "deformable.volumetric", "material_class": "fabric_cotton",
                   "deformable_preset": "foam_pillow", "size_m": [0.5, 0.35, 0.12]},
    })
    assert main(["--root", str(root), "object", "--world", "w"]) == 0
    results = {r["object"]: r for r in json.loads(capsys.readouterr().out)}
    shirt, pillow = results["shirt"], results["pillow"]
    assert shirt["template"] == "tshirt" and shirt["status"] == "processed"
    # two layers of 160 g/m^2 jersey over the outline area
    assert shirt["mass_kg"][1] == pytest.approx(2 * 0.16 * shirt["area_m2"], rel=1e-6)
    assert pillow["grid"][2] >= 3 and pillow["mass_kg"][1] == pytest.approx(20 * 0.5 * 0.35 * 0.12)

    assert main(["--root", str(root), "validate", "--world", "w"]) == 0, capsys.readouterr().out
    assert all(r["passed"] for r in json.loads(capsys.readouterr().out))
