import json

import numpy as np
import pytest
import trimesh

from blastsim.cli import main
from blastsim.frames import Y_UP_TO_Z_UP
from blastsim.objects.affordances import grasp_affordances
from blastsim.objects.mass import mass_properties
from blastsim.objects.mesh import load_asset_z_up, metric_scale
from blastsim.schemas import Param

DENSITY = Param(value=1000.0, low=900.0, high=1100.0)
THICKNESS = Param(value=0.004, low=0.003, high=0.005)


def cup(radius=0.04, height=0.1, wall=0.004):
    tube = trimesh.creation.annulus(r_min=radius - wall, r_max=radius, height=height)
    tube.apply_translation([0, 0, height / 2])
    bottom = trimesh.creation.cylinder(radius=radius, height=wall)
    bottom.apply_translation([0, 0, wall / 2])
    return trimesh.util.concatenate([tube, bottom])


def test_metric_scale_matches_sorted_sides():
    scale = metric_scale([2.0, 1.0, 4.0], [1.0, 0.5, 2.0])  # yaw-swapped footprint still matches
    assert scale.factor == pytest.approx(0.5)
    assert scale.aspect_mismatch == pytest.approx(1.0)
    assert metric_scale([1, 1, 1], [1, 1, 3]).aspect_mismatch == pytest.approx(3.0)


def test_solid_box_mass_and_inertia_are_exact():
    box = trimesh.creation.box(extents=[0.1, 0.2, 0.3])
    props = mass_properties(box, "solid", DENSITY, None)
    mass = 1000.0 * 0.1 * 0.2 * 0.3
    assert props.mass.value == pytest.approx(mass)
    assert props.mass.low == pytest.approx(mass * 0.9)
    np.testing.assert_allclose(np.diag(props.inertia), mass / 12 * np.array([0.2**2 + 0.3**2, 0.1**2 + 0.3**2, 0.1**2 + 0.2**2]), rtol=1e-6)


def test_closed_shell_uses_wall_area():
    box = trimesh.creation.box(extents=[0.1, 0.1, 0.1])  # sealed carton: outer skin only, no cavity
    props = mass_properties(box, "shell", DENSITY, THICKNESS)
    assert not props.cavity
    assert props.mass.value == pytest.approx(1000.0 * 0.004 * 0.06)
    assert props.mass.value < 1000.0 * 0.001  # far lighter than a solid block


def test_open_container_detects_cavity_and_halves_double_walls():
    mesh = cup()
    props = mass_properties(mesh, "container", DENSITY, THICKNESS)
    assert props.cavity
    assert props.mass.value == pytest.approx(0.5 * 1000.0 * 0.004 * mesh.area, rel=1e-6)
    assert props.mass.low <= props.mass.value <= props.mass.high
    assert props.com[2] < 0.05  # bottom-heavy: the base disk pulls the com below mid-height


def test_side_grasp_width_of_cylinder():
    cylinder = trimesh.creation.cylinder(radius=0.03, height=0.12, sections=64)
    cylinder.apply_translation([0, 0, 0.06])
    widths = {g.name: g.width_m for g in grasp_affordances(cylinder)}
    assert widths["side_50"] == pytest.approx(0.06, rel=0.01)
    assert "top_down" in widths


def _write_y_up_glb(mesh, path):
    y_up = mesh.copy()
    transform = np.eye(4)
    transform[:3, :3] = Y_UP_TO_Z_UP.T  # z-up -> y-up, the glTF convention
    y_up.apply_transform(transform)
    y_up.export(path)


def _world(tmp_path, sim):
    (tmp_path / ".claude").mkdir()
    obj_dir = tmp_path / "worlds" / "w" / "output" / "mug"
    obj_dir.mkdir(parents=True)
    record = {"id": "mug", "name": "mug", "description": "white ceramic mug", "source_images": [], "sim": sim}
    (obj_dir / "object.json").write_text(json.dumps({"schema_version": 1, "world": "w", "object": record}))
    _write_y_up_glb(cup(radius=0.4, height=1.0, wall=0.04), obj_dir / "0-mug.glb")  # unit-ish generated scale
    return tmp_path, obj_dir


def test_load_asset_round_trips_glb_frame(tmp_path):
    mesh = cup()
    _write_y_up_glb(mesh, tmp_path / "a.glb")
    loaded = load_asset_z_up(tmp_path / "a.glb")
    np.testing.assert_allclose(loaded.extents, mesh.extents, atol=1e-6)
    assert loaded.bounds[0, 2] == pytest.approx(0.0, abs=1e-9)  # bottom-center anchored


def test_object_pass_end_to_end_and_cousin(tmp_path, capsys):
    root, obj_dir = _world(tmp_path, {"sim_class": "rigid", "material_class": "ceramic", "mass_kind": "container",
                                      "size_m": [0.08, 0.08, 0.1]})
    assert main(["--root", str(root), "object", "--world", "w"]) == 0
    (result,) = json.loads(capsys.readouterr().out)
    assert result["status"] == "processed", result
    np.testing.assert_allclose(result["size_m"], [0.08, 0.08, 0.1], rtol=0.02)
    assert 0.05 < result["mass_kg"][1] < 0.6  # a ceramic mug, not a ceramic brick (~1.1 kg solid)
    assert result["hulls"] >= 2  # concave: one hull would fill the cup
    assert "side_50" in result["grasps_fitting_r1lite"]
    assert result["grasps"]["rim"] == pytest.approx(0.004, abs=0.002)  # pinch the 4 mm wall, not the 8 cm mouth
    sim_dir = obj_dir / "sim"
    assert (sim_dir / "0-mug-physics.json").is_file() and (sim_dir / "0-mug-collision" / "hull_00.obj").is_file()
    assert (sim_dir / "0-mug-visual" / "visual.obj").is_file()

    assert main(["--root", str(root), "object", "--world", "w"]) == 0
    assert json.loads(capsys.readouterr().out)[0]["status"] == "up_to_date"

    assert main(["--root", str(root), "validate", "--world", "w"]) == 0, capsys.readouterr().out
    assert json.loads(capsys.readouterr().out)[0]["passed"]
    assert (sim_dir / "0-mug-validation.json").is_file()

    assert main(["--root", str(root), "cousin", "--world", "w", "--object", "mug", "--slug", "Steel Tumbler",
                 "--kind", "functional", "--prompt", "a brushed steel tumbler, product shot", "--material",
                 "metal_steel", "--size", "0.07", "0.07", "0.14"]) == 0
    created = json.loads(capsys.readouterr().out)
    assert created["object_id"] == "mug--steel-tumbler"
    cousin = json.loads((root / "worlds/w/output/mug--steel-tumbler/object.json").read_text())["object"]
    assert cousin["cousin"]["parent_object"] == "mug" and cousin["sim"]["material_class"] == "metal_steel"
    assert main(["--root", str(root), "state", "--world", "w"]) == 0
    state = {o["id"]: o for o in json.loads(capsys.readouterr().out)["objects"]}
    assert state["mug"]["cousins"] == ["mug--steel-tumbler"]
