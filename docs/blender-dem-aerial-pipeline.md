# Blender DEM aerial pipeline (Strait of Malacca pilot)

A fully free, no-AI-video-model pipeline that renders a 9:16 map animation in headless Blender 5.3 from public elevation and land-cover data plus GLB ship models. Status: a 15 s, 5-shot, 1080x1920 cut exists (`malacca-final-v1`), but the visuals are judged too fake for "movie standard" (see Known gaps).

Example scripts live in `examples/malacca-blender/`. They contain absolute paths from the macOS Tart VM (`/Users/admin/workspace/blender-test`); adjust them before reuse.

## Data

- Terrain: Copernicus DEM 30 m COG tiles from `copernicus-dem-30m.s3.amazonaws.com` (NASA sites were blocked from the VM).
- Land cover: ESA WorldCover v200 2021 tile N00E102 on `esa-worldcover.s3.eu-central-1.amazonaws.com` (12000 px/deg). Classes: 10 tree, 20 shrub, 30 grass, 40 crop, 50 built, 60 bare, 80 water, 90 wetland, 95 mangrove.
- Use a venv with numpy, tifffile, imagecodecs and pillow for prep. Blender's Python has numpy but no PIL, so precompute `.npy` and PNG files.

## Scripts

| File | Purpose |
| --- | --- |
| `prep_hi.py` | Builds `zhi.npy`, `shalhi.npy` and `landtex_hi.png`: class palette, value noise, hillshade, seabed depth graded by distance to shore. |
| `shot9.py` | EEVEE aerial scene with the high-detail land texture (env `FRAMES`, `F0`, `F1`, `OUT`). |
| `shot7.py` | Cycles sea-level shots (`CINE=1` bow view, `CINE=3` tug close-up, `CINE=4` pull-back) with a numpy sine-sum ocean. |
| `titles.py` | Pillow title overlay (the VM ffmpeg has no `drawtext`). |
| `assemble.sh` | Concatenates five shots, unified grade, title overlay, audio mix, 15 s output. |

## Lessons

1. Camera `clip_start` must be 0.001 for sea-level shots; the default 0.1 BU (100 m at 1 BU = 1 km) clips near water and leaves a black band.
2. The Wave modifier showed no effect headless. Use a numpy sine-sum grid updated by a `bpy.app.handlers.frame_change_pre` handler.
3. Use an opaque teal water material for the close ocean patch; a transparent mix reveals a dark seabed.
4. Generated image pixels reset to black if the colorspace is set after `pixels.foreach_set`. Load a saved PNG instead.
5. `ShaderNodeMix` has duplicate socket names. Use `ShaderNodeMixRGB` or index sockets.
6. Beige, washed-out land came from a low sun and a bright palette. Sun 14 deg, world strength 0.65 and a darker palette worked; sun 22 deg washed out.
7. Light-blue coast triangles were the seabed wedge seen through a transparent water plane. Grade the depth from -1.5 to -6 m and make the water more opaque.
8. A 3/4 bow view beats a side view for ships. Ships are scaled 6x, so captions must say "示意比例" (schematic scale).
9. Never link a world Volume Scatter without lights (all-black frame).

## Speed (6-core Tart VM)

- EEVEE 1080x1920 at 32 samples: about 3 to 4 s per frame.
- Cycles 1080x1920: about 20 to 28 s per frame. A 15 s cut (360 frames) takes roughly 2.5 hours; 30 s takes roughly 5 hours.
- The VM clock is UTC; convert to SGT by adding 8 hours.

## Known gaps

- Ship models are low-poly and look like toys at close range.
- The aerial ocean is flat; no foam, wake detail or real reflections.
- Land is class-coloured texture, blurry at about 9 m/px in close-ups.
- EEVEE aerial shots and Cycles sea-level shots differ in look; the grade only partly hides it.
- BGM and sea sound are synthesized with ffmpeg and have not been listened to.
- Output is about 83 MB because of film grain.

## Next steps

Longer cut (about 30 s, 8 shots), new ocean with waves and foam, Cycles for all shots, finer ship detail, 12 fps render with ffmpeg interpolation, smaller output file.
