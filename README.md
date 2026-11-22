# Animation MCP

Animation MCP is a local stdio server that validates declarative 2D scenes, previews frames as SVG, and exports silent video. It uses the [MCP TypeScript SDK v1](https://ts.sdk.modelcontextprotocol.io/server).

## Build and connect

Use Node.js 24 LTS. From the repository root, run:

```sh
npm ci
npm run build
```

For video export, install the version-matched Playwright Chromium headless shell and provide FFmpeg and FFprobe separately:

```sh
npx playwright install chromium --only-shell
ffmpeg -version
ffprobe -version
```

FFmpeg must include `libvpx-vp9` for WebM or `libx264` for MP4. Validation and SVG previews work without these executables or a browser installation. The source repository's `docs/v1.1-commercial-license-audit.md` records the distribution and codec review.

For clients with JSON MCP settings, use:

```json
{
  "mcpServers": {
    "animation": {
      "command": "node",
      "args": ["/absolute/path/to/Animation-MCP/dist/index.js"]
    }
  }
}
```

For Codex CLI, run this from the repository root if you want to register it:

```sh
codex mcp add animation -- "$(command -v node)" "$PWD/dist/index.js"
```

Configure `ANIMATION_MCP_FFMPEG` and `ANIMATION_MCP_FFPROBE` with absolute executable paths if the MCP host has a restricted `PATH`. Set `ANIMATION_MCP_OUTPUT_DIR` to an absolute directory to retain exports in a known location. The default is the OS temporary directory. Each successful export has its own directory and returns the absolute path to the video. Diagnostics go to stderr.

## Build a private release archive

Use the same Node.js and npm versions for each rebuild. The macOS ARM64 reference versions are Node.js `24.21.0` and npm `11.19.0`. Run these commands from the source repository with `HEAD` set to the release revision.

```sh
source_dir=$(pwd)
revision=$(git rev-parse HEAD)
build_dir=$(mktemp -d)
release_dir=$(mktemp -d)
install_dir=$(mktemp -d)

git archive "$revision" | tar -x -C "$build_dir"
(cd "$build_dir" && npm ci --ignore-scripts && npm pack --pack-destination "$release_dir")
package_file=$(cd "$build_dir" && node -p 'const p = require("./package.json"); p.name + "-" + p.version + ".tgz"')
(cd "$release_dir" && shasum -a 256 "$package_file" > "$package_file.sha256")
printf 'Source revision: %s\nArchive: %s/%s\n' "$revision" "$release_dir" "$package_file"
```

`npm pack` runs the TypeScript build through `prepack` and includes the compiled server and `npm-shrinkwrap.json`. The shrinkwrap locks the dependency graph for both the build and the installed package. Provision the browser, FFmpeg, and FFprobe separately for video export.

Check the archive checksum, then install and exercise its CLI in the empty prefix.

```sh
(cd "$release_dir" && shasum -a 256 -c "$package_file.sha256")
printf '%s\n' '{"name":"animation-mcp-release-check","version":"0.0.0","private":true}' > "$install_dir/package.json"
npm install --prefix "$install_dir" --omit=dev --ignore-scripts "$release_dir/$package_file"
node "$source_dir/scripts/verify-release.mjs" "$install_dir"
npm sbom --prefix "$install_dir" --omit=dev --sbom-format=cyclonedx > "$release_dir/$package_file.cdx.json"
```

Retain the versioned archive, its SHA-256 file, the installed dependency SBOM, and the source revision together. For an installed archive, point Codex at the absolute path to `node_modules/.bin/animation-mcp` in the installation prefix.

## Tools

| Tool | Arguments | Result |
| --- | --- | --- |
| `animation_validate` | `scene` | Scene dimensions, duration, fps, and scheduled frame count |
| `animation_preview` | `scene`, `time` | Standalone SVG markup at the given time in seconds |
| `animation_export` | `scene`, `format` (`webm` or `mp4`) | Verified file path, codec, dimensions, frame count, and scheduled video duration |

All three tools advertise output schemas and return JSON data in `structuredContent` and as a JSON text block.

Example arguments for `animation_export`:

```json
{
  "format": "webm",
  "scene": {
    "width": 320,
    "height": 180,
    "fps": 24,
    "duration": 2,
    "background": "#112036",
    "layers": [
      {
        "type": "circle",
        "radius": 18,
        "fill": "#FFBD66",
        "keyframes": [
          { "time": 0, "x": 40, "y": 90 },
          { "time": 2, "x": 280, "y": 90 }
        ]
      }
    ]
  }
}
```

Layers draw in array order. Rectangles take `width` and `height`, circles take `radius`, and text takes `text` and `fontSize`. Keyframes set top-left coordinates for rectangles, center coordinates for circles, and baseline coordinates for text. Positions and opacity interpolate linearly, holding the first or last keyframe outside its interval. Keyframe opacity defaults to layer opacity, which defaults to 1. Text uses the system sans-serif font.

Export samples each frame at its start time and rounds partial final frames up to one full frame. It requires even dimensions and supports one export at a time per server process. Scenes support up to 30 seconds, 1920×1080, 60 fps, and 64 layers, with a combined export limit of 300 million frame pixels. The tool returns after encoding and verification, so longer renders may require a longer client tool timeout.
