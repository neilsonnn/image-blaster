"""`blastsim` CLI. Prints JSON to stdout, like the Node project scripts."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from . import priors
from .paths import latest_indexed, world_paths
from .robots import load_robot_spec, missing_fields
from .schemas import ObjectSim


def _print(value) -> None:
    print(json.dumps(value, indent=2, default=lambda o: o.model_dump(mode="json") if hasattr(o, "model_dump") else str(o)))


def _object_state(wp, object_id: str) -> dict:
    object_json = json.loads((wp.object_dir(object_id) / "object.json").read_text())
    sim_block = object_json.get("object", {}).get("sim")
    state: dict = {"id": object_id, "sim": None, "sim_error": None}
    if sim_block is None:
        state["sim_error"] = "missing object.sim (re-run uncover with the sim contract)"
    else:
        try:
            sim = ObjectSim.model_validate(sim_block)
            priors.material(sim.material_class)
            state["sim"] = sim.model_dump(mode="json")
        except (ValidationError, KeyError) as error:
            state["sim_error"] = str(error)

    sim_dir = wp.object_sim_dir(object_id)
    physics = latest_indexed(sim_dir, f"{object_id}-physics")
    state["physics"] = str(Path(physics.path).relative_to(wp.root)) if physics else None
    state["cousin"] = object_json.get("object", {}).get("cousin")
    state["cousins"] = [other for other in wp.object_ids() if other.startswith(f"{object_id}--")]
    return state


def cmd_state(args) -> int:
    wp = world_paths(args.world, args.root)
    if not wp.world.is_dir():
        _print({"world": args.world, "error": f"missing {wp.world}"})
        return 1
    objects = [_object_state(wp, object_id) for object_id in wp.object_ids()]
    scenes_dir = wp.sim / "scenes"
    _print({
        "world": args.world,
        "path": str(wp.world.relative_to(wp.root)),
        "has_world": latest_indexed(wp.world_output, "world") is not None,
        "has_scene_json": wp.scene_json.is_file(),
        "objects": objects,
        "objects_sim_ready": sum(1 for o in objects if o["sim"]),
        "scene_cousins": sorted(p.name for p in scenes_dir.iterdir() if p.is_dir()) if scenes_dir.is_dir() else [],
    })
    return 0


def cmd_object(args) -> int:
    from .objects import process_object

    wp = world_paths(args.world, args.root)
    object_ids = args.object or wp.object_ids()
    results = [process_object(wp, object_id, force=args.force, robot=args.robot) for object_id in object_ids]
    for result in results:
        if result.get("status") == "up_to_date":
            result["physics"] = "unchanged"
    _print(results)
    return 0


def cmd_validate(args) -> int:
    from .validate import drop_test, latest_physics, settle_test

    wp = world_paths(args.world, args.root)
    reports = []
    for object_id in args.object or wp.object_ids():
        try:
            found = latest_physics(wp, object_id)
            deformable = found is not None and found[1].physics.sim_class.startswith("deformable.")
            report = (settle_test if deformable else drop_test)(wp, object_id, robot=args.robot)
        except (FileNotFoundError, TypeError) as error:
            reports.append({"object": object_id, "status": "skipped", "reason": str(error)})
            continue
        failed = [c.model_dump(mode="json", exclude_none=True) for c in report.checks if not c.passed]
        reports.append({"object": object_id, "passed": report.passed, "failed": failed})
    _print(reports)
    return 0 if all(r.get("passed", True) for r in reports) else 3


def cmd_cousin(args) -> int:
    from .cousins import create_generative_cousin

    wp = world_paths(args.world, args.root)
    overrides = {}
    if args.material:
        priors.material(args.material)
        overrides["material_class"] = args.material
    if args.mass_kind:
        overrides["mass_kind"] = args.mass_kind
    if args.size:
        overrides["size_m"] = args.size
    created = create_generative_cousin(wp, args.object, args.slug, args.kind, args.prompt, name=args.name,
                                       description=args.description, sim_overrides=overrides)
    created["next"] = (f"Agent(image-blast-3d): world {args.world}, object id {created['object_id']}, "
                       f"--image-edit-prompt from object.cousin.prompt; then `blastsim object --world {args.world} "
                       f"--object {created['object_id']}`")
    _print(created)
    return 0


def cmd_priors(args) -> int:
    if args.what == "materials":
        _print(priors.material_names())
    elif args.what == "material":
        _print(priors.material(args.names[0]))
    elif args.what == "pair":
        _print(priors.friction(args.names[0], args.names[1]))
    elif args.what == "presets":
        kinds = args.names or list(priors.DEFORMABLE_KINDS)
        _print({kind: priors.deformable_preset_names(kind) for kind in kinds})
    elif args.what == "preset":
        _print(priors.deformable_preset(args.names[0], args.names[1]))
    return 0


def cmd_robot(args) -> int:
    if args.action == "fetch":
        from .robots.fetch import fetch

        manifest = fetch(args.name, force=args.force)
        _print({k: v for k, v in manifest.items() if k != "files"} | {"files": len(manifest["files"])})
        return 0
    if args.action == "build":
        from .robots.build import build

        _print(build(args.name, force=args.force))
        return 0
    if args.action == "validate":
        from .robots.validate import validate

        report = validate(args.name)
        _print(report)
        return 0 if report.passed else 3
    spec = load_robot_spec(args.name)
    missing = missing_fields(spec)
    _print({"robot": args.name, "variant": spec.get("variant"), "verified": spec.get("verified", False),
            "missing": missing})
    return 0 if not missing and spec.get("verified") else 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="blastsim", description=__doc__)
    parser.add_argument("--root", help="IMAGE-BLASTER repo root (default: $BLASTSIM_ROOT or auto-detect)")
    sub = parser.add_subparsers(dest="command", required=True)

    state = sub.add_parser("state", help="sim readiness of a world: object sim tags, physics files, cousins, scenes")
    state.add_argument("--world", required=True)
    state.set_defaults(func=cmd_state)

    obj = sub.add_parser("object", help="physics pass for rigid/static objects: scale, hulls, mass, grasps")
    obj.add_argument("--world", required=True)
    obj.add_argument("--object", action="append", help="object id (repeatable); default: every object")
    obj.add_argument("--robot", default="r1lite", help="robot whose gripper decides which grasps fit")
    obj.add_argument("--force", action="store_true", help="reprocess even if the source model is unchanged")
    obj.set_defaults(func=cmd_object)

    val = sub.add_parser("validate", help="drop-test processed objects in MuJoCo (settle, penetration, tilt)")
    val.add_argument("--world", required=True)
    val.add_argument("--object", action="append")
    val.add_argument("--robot", default="r1lite")
    val.set_defaults(func=cmd_validate)

    cousin = sub.add_parser("cousin", help="create a generative object cousin envelope (generation runs via the 3D agent)")
    cousin.add_argument("--world", required=True)
    cousin.add_argument("--object", required=True, help="parent object id")
    cousin.add_argument("--slug", required=True, help="cousin slug, e.g. matte-blue or steel-tumbler")
    cousin.add_argument("--kind", required=True, choices=["appearance", "functional"])
    cousin.add_argument("--prompt", required=True, help="image-edit prompt producing the cousin's reference image")
    cousin.add_argument("--name")
    cousin.add_argument("--description")
    cousin.add_argument("--material", help="override sim.material_class (functional cousins)")
    cousin.add_argument("--mass-kind", choices=["solid", "shell", "container"])
    cousin.add_argument("--size", type=float, nargs=3, metavar=("W", "D", "H"), help="override sim.size_m in meters")
    cousin.set_defaults(func=cmd_cousin)

    prior = sub.add_parser("priors", help="inspect physics prior tables")
    prior.add_argument("what", choices=["materials", "material", "pair", "presets", "preset"])
    prior.add_argument("names", nargs="*")
    prior.set_defaults(func=cmd_priors)

    robot = sub.add_parser("robot", help="robot spec check, vendor fetch, MJCF build, dynamic validation")
    robot.add_argument("action", nargs="?", default="check", choices=["check", "fetch", "build", "validate"])
    robot.add_argument("name", nargs="?", default="r1lite")
    robot.add_argument("--force", action="store_true", help="re-download / rebuild cached files")
    robot.set_defaults(func=cmd_robot)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except (KeyError, FileNotFoundError, FileExistsError, ValueError) as error:
        _print({"error": str(error).strip("'\"")})
        return 1


if __name__ == "__main__":
    sys.exit(main())
