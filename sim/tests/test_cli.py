import json

from blastsim.cli import main


def _world(tmp_path):
    (tmp_path / ".claude").mkdir()
    obj = tmp_path / "worlds" / "w" / "output"
    for object_id, sim in [
        ("mug", {"sim_class": "rigid", "material_class": "ceramic", "mass_kind": "container", "size_m": [0.12, 0.09, 0.1]}),
        ("towel", None),
    ]:
        (obj / object_id).mkdir(parents=True)
        body = {"id": object_id, "name": object_id}
        if sim:
            body["sim"] = sim
        (obj / object_id / "object.json").write_text(json.dumps({"schema_version": 1, "world": "w", "object": body}))
    (obj / "mug" / "sim").mkdir()
    (obj / "mug" / "sim" / "0-mug-physics.json").write_text("{}")
    return tmp_path


def test_state(tmp_path, capsys):
    root = _world(tmp_path)
    assert main(["--root", str(root), "state", "--world", "w"]) == 0
    out = json.loads(capsys.readouterr().out)
    by_id = {o["id"]: o for o in out["objects"]}
    assert out["objects_sim_ready"] == 1
    assert by_id["mug"]["physics"] == "worlds/w/output/mug/sim/0-mug-physics.json"
    assert "missing object.sim" in by_id["towel"]["sim_error"]


def test_priors_and_robot(capsys):
    assert main(["priors", "pair", "gripper_pad", "glass"]) == 0
    assert json.loads(capsys.readouterr().out)["value"] == 0.6
    assert main(["robot", "check", "r1lite"]) == 2
    missing = json.loads(capsys.readouterr().out)["missing"]
    assert "gripper.max_force_n" in missing and "gripper.stroke_m" not in missing
