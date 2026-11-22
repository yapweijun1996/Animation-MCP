# Singapore macOS ARM64 private pilot

**Status:** Scope confirmed. Offline SVG is available for qualification. Video profiles and pilot release remain pending.

## Scope

Named business teams in Singapore run Animation MCP locally on macOS ARM64 and use the resulting animations internally within their participating organization in Singapore. Deliver a versioned npm-compatible archive privately. Provision Node.js separately from an approved source. Video export also requires qualified Chromium Headless Shell and its helpers, FFmpeg, and FFprobe.

The pilot covers silent 2D SVG scenes with rectangles, circles, text, and position and opacity keyframes. The local stdio tools validate a scene, return a static SVG frame, and export a standalone animated SVG. Audio, 3D, hosted rendering, public distribution, and customer delivery are outside this pilot.

## Launch output

| Role | Profile | Launch rule |
| --- | --- | --- |
| Offline deliverable | Animated SVG with keyframe playback in the user's browser | Set `ANIMATION_MCP_VIDEO_FORMATS=none`. Verify local playback and qualify the package and browser environment for distribution. |
| Primary video candidate | `mp4`, H.264 via `libx264`, `yuv420p`, one video stream and zero audio streams | Qualify the exact FFmpeg/x264 build and the designated playback application for this Singapore internal business workflow. QuickTime Player is the existing playback candidate. |
| Fallback video candidate | `webm`, VP9 via `libvpx-vp9`, `yuv420p`, one video stream and zero audio streams | Qualify the exact VP9 encoder and playback path separately. Enable WebM as the pilot's video format only after the pilot owner accepts the change and the intended users' playback workflow passes. |

For the SVG workflow, set `ANIMATION_MCP_VIDEO_FORMATS=none`, leave `ANIMATION_MCP_ENABLE_3D` unset or set it to `false`, and verify that the MCP advertises only validation, preview, and SVG export. Use the video gates below when approving a video-enabled profile. Set `ANIMATION_MCP_VIDEO_FORMATS` to the single cleared video format if qualifying such a profile.

## Release acceptance

Record each result, the tested package version and SHA-256, the macOS version and binary versions, and a link to the supporting evidence. Prior development runs can guide these checks. Close the gates against the actual candidate archive and the approved runtime.

Use the [production readiness checklist](production-readiness.md) for the current evidence, owners, and steps to reach a release decision.

| Gate | Pass criteria |
| --- | --- |
| Source and private archive | The release is traceable to a committed source revision, locked build dependencies, and a versioned archive with a checksum. Generate an SBOM for the actual release, include applicable notices and project distribution terms, and verify the archive payload and resolved runtime dependencies. Confirm separately provisioned binaries and caches are absent from the archive. |
| Clean installation | On a clean macOS ARM64 environment, install the archive and qualified Node.js. Register the installed entry point in Codex and discover the tools for the selected profile over stdio. For a video-enabled profile, also qualify Chromium and its helpers, FFmpeg and FFprobe. Record their suppliers, versions, hashes, and encoder availability. |
| Tool contract | Exercise valid and invalid scene input, SVG interpolation and text escaping, and preview time limits. For a video-enabled profile, confirm invalid export dimensions and over-budget scenes fail before rendering. Confirm unselected video formats cannot be invoked. |
| Offline SVG and playback | Export a moving scene. Open the file directly with network access disabled in the supported browser, verify start, intermediate, and final positions and opacity, and confirm the last frame holds and reload restarts playback. |
| Security and data handling | Review current advisories for the locked dependencies and provisioned binaries. Resolve findings that block pilot use under the organization's security policy. Verify outputs are written under the configured directory, diagnostics preserve stdio protocol framing, and exported files follow the organization's internal access and retention rules. |
| Video and playback, if enabled | Export a moving 960×540 fixture at 24 fps for 6 seconds. Verify the selected codec, pixel format, even dimensions, 144 decoded frames, expected duration, and zero audio streams. Inspect the start, middle, and end for motion, layout, and unexpected blank frames. Play the complete file in the designated pilot player. |
| Cancellation and resource limits | Test the largest planned workload against the tool timeout and available disk space. Exercise an output write failure and an interrupted process and verify documented recovery. For video, verify a second export returns a busy error, cancel during capture and encoding, confirm temporary work is removed and the encoder exits, and retry on the same connection. |
| Pilot operations | Give users setup instructions, a sample scene, the approved output location and retention guidance, and steps to disable the MCP and recover from a failed run. Record the supported runtime, playback path, and a pilot contact. |
| Profile clearance and sign-off | For video, record the product-specific decision for the chosen encoder, decoder or player, and internal use of generated files in Singapore. Record the pilot owner's acceptance of the archive, functional evidence, and selected format before distributing it. |

The [commercial license audit](v1.1-commercial-license-audit.md) holds the supplier and licensing evidence. Its audio-capable reference profiles inform future work. Video qualification for this pilot covers the selected silent video profile.
