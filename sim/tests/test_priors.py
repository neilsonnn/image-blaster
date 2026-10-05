import pytest

from blastsim import priors
from blastsim.robots import load_robot_spec, missing_fields


def test_every_material_loads_with_valid_ranges():
    for name in priors.material_names():
        entry = priors.material(name)
        assert entry["contact"] in {"stiff", "medium", "soft"}
        assert entry["density_kg_m3"].low > 0


def test_every_deformable_preset_loads_and_references_a_material():
    materials = set(priors.material_names())
    for kind in priors.DEFORMABLE_KINDS:
        for name in priors.deformable_preset_names(kind):
            preset = priors.deformable_preset(kind, name)
            assert preset["material_class"] in materials, (kind, name)


def test_friction_pair_override_and_fallback():
    assert priors.friction("ceramic", "gripper_pad").value == pytest.approx(0.8)
    assert priors.friction("gripper_pad", "ceramic").value == pytest.approx(0.8)
    fallback = priors.friction("wood", "metal_steel")
    assert fallback.low <= fallback.value <= fallback.high
    with pytest.raises(KeyError):
        priors.material("unobtainium")


def test_r1lite_spec_reports_missing_vendor_facts():
    spec = load_robot_spec("r1lite")
    missing = missing_fields(spec)
    assert spec["verified"] is False
    assert spec["variant"] == "2026_a1x"
    assert {"arms.payload_kg_per_arm", "gripper.max_force_n", "base.max_lin_vel_m_s"} <= set(missing)
    assert "arms.dof_per_arm" not in missing
