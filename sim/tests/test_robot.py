"""Robot build tests. The full-model tests need the vendor cache (`blastsim robot fetch`), so they skip offline."""

import mujoco
import numpy as np
import pytest

from blastsim.robots import load_robot_spec
from blastsim.robots.build import ctrl_for_qpos, keyframe_qpos, srdf_disabled_pairs
from blastsim.robots.fetch import cache_dir, mesh_refs, vendor_mesh_name

TOY = """
<mujoco>
  <worldbody>
    <body name="a">
      <joint name="hinge" type="hinge" range="0.2 1.0" limited="true"/>
      <geom type="box" size=".1 .1 .1"/>
      <body name="b" pos="0 0 .3">
        <joint name="slide" type="slide" axis="0 1 0" range="-0.05 0" limited="true"/>
        <geom type="box" size=".05 .05 .05"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <position name="p" joint="hinge" kp="10"/>
    <velocity name="v" joint="slide" kv="5"/>
  </actuator>
</mujoco>
"""


def test_keyframe_clamps_into_limits_and_holds():
    model = mujoco.MjModel.from_xml_string(TOY)
    qpos = keyframe_qpos(model, {"slide": 0.3})
    assert qpos[0] == pytest.approx(np.deg2rad(0.2))  # MJCF hinge ranges are degrees; 0 clamps up to the lower limit
    assert qpos[1] == pytest.approx(0.0)  # slide 0.3 clamped down to its upper limit
    np.testing.assert_allclose(ctrl_for_qpos(model, qpos), [np.deg2rad(0.2), 0.0])  # velocity actuator holds at 0


def test_vendor_mesh_naming(tmp_path):
    urdf = tmp_path / "r.urdf"
    urdf.write_text('<robot name="r"><link name="l"><visual><geometry><mesh filename="package://x/meshes/a.STL"/></geometry></visual>'
                    '<collision><geometry><mesh filename="package://x/collision_meshes/a.STL"/></geometry></collision></link></robot>')
    assert mesh_refs(urdf) == [("collision_meshes", "a.STL"), ("meshes", "a.STL")]
    assert vendor_mesh_name("collision_meshes", "a.STL") == "a_collision.STL"
    srdf = tmp_path / "r.srdf"
    srdf.write_text('<robot><disable_collisions link1="a" link2="b" reason="Adjacent"/></robot>')
    assert srdf_disabled_pairs(srdf) == [("a", "b")]


R1LITE_CACHE = cache_dir("r1lite", load_robot_spec("r1lite")["variant"])
needs_cache = pytest.mark.skipif(not (R1LITE_CACHE / "manifest.json").is_file(), reason="run `blastsim robot fetch` first")


@needs_cache
def test_r1lite_build_and_validate():
    from blastsim.robots.build import build
    from blastsim.robots.validate import validate

    result = build("r1lite")
    assert result["nu"] == 20 and set(result["cameras"]) == {"head", "wrist_left", "wrist_right"}
    gripper = result["measured"]["gripper"]
    assert 0.09 < gripper["max_open_width_m"] < 0.1  # 2 x 0.05 m finger travel minus pad faces
    assert gripper["closed_gap_m"] < 0.003
    report = validate("r1lite")
    assert report.passed, [c for c in report.checks if not c.passed]
