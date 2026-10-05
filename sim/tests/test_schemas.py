import numpy as np
import pytest
from pydantic import TypeAdapter, ValidationError

from blastsim.schemas import ObjectSim, Param, PhysicsFile, SceneGraph, TaskFile
from blastsim.schemas.physics import PhysicsSpec


def test_param_range_and_sampling():
    p = Param(value=0.5, low=0.4, high=0.7)
    rng = np.random.default_rng(1)
    assert all(0.4 <= p.sample(rng) <= 0.7 for _ in range(100))
    log = Param(value=1e5, low=1e4, high=1e6, dist="loguniform")
    assert all(1e4 <= log.sample(rng) <= 1e6 for _ in range(100))
    with pytest.raises(ValidationError):
        Param(value=1.0, low=0.4, high=0.7)
    with pytest.raises(ValidationError):
        Param(value=0.5)


def test_physics_discriminated_union():
    spec = TypeAdapter(PhysicsSpec).validate_python({
        "sim_class": "deformable.cloth",
        "preset": "cotton_towel_heavy",
        "areal_density_kg_m2": {"value": 0.5, "low": 0.35, "high": 0.65},
        "young_pa": {"value": 5e5, "low": 1e5, "high": 3e6, "dist": "loguniform"},
        "poisson": {"value": 0.3, "low": 0.1, "high": 0.45},
        "thickness_m": {"value": 0.003, "low": 0.002, "high": 0.005},
        "damping": {"value": 0.02, "low": 0.005, "high": 0.1},
        "contact": {"material_class": "fabric_cotton"},
    })
    assert type(spec).__name__ == "ClothPhysics"
    file = PhysicsFile(world="w", object_id="towel", physics=spec)
    assert PhysicsFile.model_validate_json(file.model_dump_json()) == file


def test_object_sim_block():
    sim = ObjectSim.model_validate({
        "sim_class": "articulated",
        "material_class": "wood",
        "articulation_template": "drawer",
        "built_in": True,
        "size_m": [0.6, 0.5, 0.2],
        "relations": [{"type": "part_of", "target": "kitchen-cabinet"}],
    })
    assert sim.sim_class.value == "articulated"
    with pytest.raises(ValidationError):
        ObjectSim.model_validate({"sim_class": "jelly", "material_class": "wood"})


def test_scene_graph_rejects_dangling_edges():
    base = {
        "world": "w",
        "supports": [{"id": "floor", "kind": "floor", "pose": {}, "extent_m": [5, 5, 0]}],
        "nodes": [{"id": "mug", "kind": "object", "object_id": "mug"}],
    }
    SceneGraph.model_validate({**base, "edges": [{"type": "on", "src": "mug", "dst": "floor"}]})
    with pytest.raises(ValidationError):
        SceneGraph.model_validate({**base, "edges": [{"type": "on", "src": "mug", "dst": "table"}]})


def test_task_file():
    task = TaskFile.model_validate({
        "world": "w", "task": "mug-to-sink", "template": "nav_then_pick_place", "scene": "c0",
        "language": "put the mug in the sink",
        "goal": [{"name": "in", "args": ["mug", "sink"]}],
    })
    assert task.robot == "r1lite"
