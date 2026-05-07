# IMAGE-BLAST

Use this prompt/spec to create literal image and scene descriptions for downstream world, object, and sound generation.

## Goal

Analyze one source image at a time and write a sibling JSON file next to it in `source/`. After every source image has a sibling JSON analysis, merge those flat records into the root `image.json`.

Per-image JSON and root `image.json` use the same flat schema. Do not write an `images[]` array anywhere.

## Literal Description Rules

- Describe the image like a technical scene survey.
- Prefer concrete visible evidence over interpretation.
- Do not write narrative phrases such as "feels like", "hints at", "suggests", "under surveillance", "relics", "mysterious", "lonely", or similar editorial framing.
- Keep descriptions useful for generation prompts: subject, arrangement, material, color, shape, lighting, camera/view, and environmental effects.
- If something is uncertain, do not make assumptions about it; describe only what is certain.
- Deduplicate repeated objects. If many similar jars, rocks, chairs, or tools appear, represent them as one unique object with a `count_estimate`.
- For objects, include only single rigid or mostly rigid items that can be cleanly segmented as standalone assets.
- Never group multiple different items into one object candidate, and never create compound assets such as "desk with items", "table setup", "shelf contents", "chair and pillow", or "tool pile". Split visible separable items into separate candidates. Err on letting the user decide which objects to include if you are unsure.
- Avoid sky, fog, terrain, walls, floors, ceilings, whole buildings, and broad environment surfaces unless they are clearly standalone props that make sense as a rigidbody or static scene object.
- Preserve stable object IDs if updating existing object directories.

## Shared JSON Shape

Use this exact flat shape for both `worlds/<slug>/source/<image-name>.json` and `worlds/<slug>/image.json`:

```json
{
  "schema_version": 1,
  "world": "sterile-electronic-lab",
  "source_images": ["worlds/sterile-electronic-lab/source/example.png"],
  "scene_name": "Sterile Electronic Lab",
  "short_caption": "A clinical room with glass display cases and ceramic vessels.",
  "literal_description": "A compact room contains rows of aluminum-framed glass enclosures. Each enclosure holds terracotta ceramic vessels on dark pedestals. A computer workstation sits against the left wall. The room has pale walls, a tiled floor, and even overhead fluorescent lighting.",
  "environment": "Compact indoor display or storage room with glass enclosures, tiled floor, pale walls, and a workstation.",
  "visual_style": "photorealistic, clinical, documentary",
  "lighting": "Even overhead fluorescent lighting, cool color temperature, low contrast, soft shadows.",
  "atmosphere": "Clean indoor air with no visible fog, smoke, dust, haze, or weather.",
  "ambient_sound": "Low ventilation hum with faint fluorescent buzz.",
  "objects": [
    {
      "id": "terracotta-amphora",
      "name": "terracotta amphora",
      "description": "Tall two-handled terracotta ceramic vessel with a narrow neck and rounded body.",
      "count_estimate": 3,
      "materials": ["terracotta ceramic"],
      "source_images": ["worlds/sterile-electronic-lab/source/example.png"],
      "evidence": [
        {
          "image": "worlds/sterile-electronic-lab/source/example.png",
          "location_in_image": "inside glass cases along the back wall",
        }
      ],
      "generate_as_3d_object": true
    }
  ]
}
```

## Field Guidance

- `source_images`: image provenance. Per-image JSON usually has one path; root `image.json` has all merged source image paths.
- `scene_name`: short human-readable scene name.
- `short_caption`: about 10 words, literal and factual.
- `literal_description`: factual visible description only. Do not include narrative, symbolism, or editorial language.
- `environment`: physical setting and visible environmental conditions only.
- `visual_style`: concise visual/rendering labels only.
- `lighting`: visible direction, softness, temperature, contrast, shadow quality, and time of day only when evident.
- `atmosphere`: visible fog, dust, haze, smoke, glow, weather, particles, or explicitly state none visible.
- `ambient_sound`: concise positive description of audible ambience based on visible regular or sustained sound sources only. Describe only what should be present; do not include exclusions, negative prompts, or loop wording.
- `objects`: persisted descriptive object candidates. These are fallback/debug data, not generation state.

## Merge Rules

To create root `worlds/<slug>/image.json`, read all valid `worlds/<slug>/source/*.json` image analyses and merge them into the same flat schema:

- Combine `source_images`.
- Synthesize one shared `scene_name`, `short_caption`, and `literal_description`.
- Merge `environment`, `visual_style`, `lighting`, `atmosphere`, and `ambient_sound` from common or representative visible traits.
- Deduplicate `objects` by stable `id`, name, material, and visible shape.
- Preserve all source image evidence on merged objects.
- Do not write an `images[]` array.

## Object Extraction

After root `image.json` is approved, create or update one `object.json` per approved object at:

```text
worlds/<slug>/output/<object-slug>/object.json
```

Each object file should contain the stable object ID, name, literal description, materials, source image paths, evidence, and working directory. Generated state lives beside it as files and hidden request JSON.
