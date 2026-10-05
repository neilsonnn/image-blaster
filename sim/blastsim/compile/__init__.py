"""MJCF compilation. Shared MuJoCo conventions live here so robot and scene builders agree.

Collision bits (MuJoCo collides two geoms when contype_a & conaffinity_b or contype_b & conaffinity_a):
- FLOOR: the floor/support planes.
- WORLD: everything else.
The robot base and wheels use WORLD only, so they never touch the floor: the base rides on planar joints,
and floor contact would fight the missing z DOF. Everything else uses WORLD | FLOOR.
"""

COLLIDE_WORLD = 1
COLLIDE_FLOOR = 2
COLLIDE_ALL = COLLIDE_WORLD | COLLIDE_FLOOR
