"""Object cousins (L1). A cousin is an ordinary object dir `output/<parent>--<slug>/` whose object.json carries
`object.cousin`, so generation (3D skill), SFX and the viewer need no changes. This module only writes the intent;
generation is a provider call and runs through the image-blast-3d agent."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .paths import WorldPaths, latest_indexed, slugify
from .schemas import CousinInfo, ObjectSim, cousin_id

REFERENCE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")


def create_generative_cousin(wp: WorldPaths, parent: str, slug: str, kind: str, prompt: str,
                             name: str | None = None, description: str | None = None,
                             sim_overrides: dict | None = None) -> dict:
    parent_dir = wp.object_dir(parent)
    parent_record = json.loads((parent_dir / "object.json").read_text())["object"]
    if parent_record.get("cousin"):
        raise ValueError(f"{parent} is itself a cousin; make cousins of the base object")
    slug = slugify(slug)
    object_id = cousin_id(parent, slug)
    object_dir = wp.cousin_dir(parent, slug)
    if (object_dir / "object.json").exists():
        raise FileExistsError(f"cousin already exists: {object_dir.relative_to(wp.root)}")

    # Generative cousins edit the parent's clean reference render when there is one, else its source images.
    reference = latest_indexed(parent_dir, parent, REFERENCE_EXTENSIONS)
    source_images = ([str(Path(reference.path).relative_to(wp.root))] if reference
                     else list(parent_record.get("source_images", [])))
    sim = ObjectSim.model_validate({**parent_record["sim"], **(sim_overrides or {})})
    record = {
        "id": object_id,
        "name": name or f"{parent_record['name']} ({slug.replace('-', ' ')})",
        "description": description or parent_record.get("description", ""),
        "materials": parent_record.get("materials", []),
        "source_images": source_images,
        "evidence": [{"image": image, "notes": f"{kind} cousin of {parent}"} for image in source_images],
        "generate_as_3d_object": True,
        "sim": sim.model_dump(mode="json", exclude_defaults=True) | {"sim_class": sim.sim_class.value},
        "cousin": CousinInfo(parent_object=parent, kind=kind, generator="generative", prompt=prompt)
        .model_dump(mode="json", exclude_none=True),
        "working_dir": str(object_dir.relative_to(wp.root)),
    }
    object_dir.mkdir(parents=True)
    state = {"schema_version": 1, "world": wp.slug, "object": record,
             "updated_at": datetime.now(timezone.utc).isoformat()}
    (object_dir / "object.json").write_text(json.dumps(state, indent=2) + "\n")
    return {"object_id": object_id, "object_json": str((object_dir / "object.json").relative_to(wp.root)),
            "image_edit_prompt": prompt, "source_images": source_images}
