import numpy as np

from blastsim import frames


def test_y_up_to_z_up_axes():
    up = frames.points_y_up_to_z_up([0, 1, 0])
    toward_viewer = frames.points_y_up_to_z_up([0, 0, 1])
    np.testing.assert_allclose(up, [0, 0, 1])
    np.testing.assert_allclose(toward_viewer, [0, -1, 0])
    assert np.isclose(np.linalg.det(frames.Y_UP_TO_Z_UP), 1.0)  # proper rotation, handedness kept


def test_yaw_about_viewer_up_becomes_yaw_about_sim_z():
    pos, quat = frames.placement_to_sim_pose([1.0, 0.5, -2.0], [0.0, np.pi / 2, 0.0])
    np.testing.assert_allclose(pos, [1.0, 2.0, 0.5])
    np.testing.assert_allclose(quat, [np.cos(np.pi / 4), 0, 0, np.sin(np.pi / 4)], atol=1e-12)


def test_euler_xyz_matches_three_js_order():
    euler = [0.3, -0.7, 1.1]
    expected = frames.rot_x(0.3) @ frames.rot_y(-0.7) @ frames.rot_z(1.1)
    np.testing.assert_allclose(frames.euler_xyz_to_matrix(euler), expected)


def test_quat_roundtrip_random():
    rng = np.random.default_rng(0)
    for _ in range(50):
        m = frames.euler_xyz_to_matrix(rng.uniform(-np.pi, np.pi, 3))
        w, x, y, z = frames.matrix_to_quat_wxyz(m)
        back = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ])
        np.testing.assert_allclose(back, m, atol=1e-9)


def test_world_raw_to_sim_flip_scale_offset():
    # flip_y rotates pi about x: raw (0, 1, 0) points down in the viewer
    p = frames.world_raw_to_viewer([[0.0, 1.0, 0.0]], metric_scale_factor=2.0, ground_plane_offset=0.5, flip_y=True)
    np.testing.assert_allclose(p, [[0.0, -1.5, 0.0]], atol=1e-12)
    np.testing.assert_allclose(frames.world_raw_to_sim([[0.0, 1.0, 0.0]], 2.0, 0.5, True), [[0.0, 0.0, -1.5]], atol=1e-12)


def test_bottom_center_offset_and_scale():
    verts = np.array([[-1.0, 2.0, 0.0], [3.0, 5.0, 4.0]])
    np.testing.assert_allclose(frames.bottom_center_offset(verts), [-1.0, -2.0, -2.0])
    np.testing.assert_allclose(frames.scale_y_up_to_z_up([1, 2, 3]), [1, 3, 2])
    np.testing.assert_allclose(frames.viewer_object_scale([1, 1, 2]), [0.5, 0.5, 1.0])
