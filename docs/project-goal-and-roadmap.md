# Animation MCP project goal and roadmap

Decision baseline: 22 November 2026, local release candidate `0.2.0-rc.1`, source commit `35ecc25`.

The handoff below describes that retained archive. A later source revision added optional Three.js preview under the same package version. Consult the [production readiness checklist](production-readiness.md) when choosing an archive or assessing current release evidence.

## Project goal

Enable a business user in Singapore to describe an internal workflow in Codex, inspect a preview, request a correction, and save a silent 2D animation they can reopen and replay offline on a macOS ARM64 workstation. The first end-to-end milestone is a pilot participant completing that journey on a second Mac using the private installation package.

Codex translates the brief and revisions into scene JSON. The local MCP validates the scene, samples the timeline, and writes the artifact. The browser plays the exported SVG offline. Offline playback and local rendering are verified properties of the artifact workflow. The Codex conversation and its data handling depend on the organization's Codex configuration.

## What the candidate does today

| Contract | Observation | Significance for a business user |
| --- | --- | --- |
| Validate a scene | A two-second, four-fps fixture returned eight scheduled frames. An invalid duration submitted for export returned an error and left the isolated output directory empty. | Structural validation catches malformed scenes. The user still needs to confirm the business steps and wording. |
| Preview a time | A circle moving from x=10 to x=50 over two seconds appeared at x=30 in the midpoint SVG. | A user can check intermediate states before exporting. |
| Export an animated SVG | Two calls with identical input created different paths with identical SVG contents. The installed package exported with unavailable browser and FFmpeg paths. | The file is self-contained. A retry produces another file, so onboarding should explain where exports accumulate and which copy to share. |
| Select the business profile | Local Codex explicitly sets `ANIMATION_MCP_VIDEO_FORMATS=none`. The installed-package check discovered the three SVG workflow tools and rejected a direct video export call. The development default enables both video formats. | Include the explicit setting in pilot setup and verify discovery after installation. |
| Deliver the executable | A fresh archive of the source commit built and packed from the shrinkwrap. The resulting tarball installed in an empty prefix and passed the repository's stdio release check. | Rebuilding and installing on the development host is repeatable. Independent workstation onboarding remains open. |

The checks above ran on the development Mac. The package build used the local npm cache. Earlier offline Chromium playback checks covered interpolation, opacity, final-frame hold, and replay. Opening the sample in Safari was recorded separately.

## Pilot handoff on 22 November 2026

The private candidate passed development-host verification on macOS ARM64 with Node.js 24.21.0. The retained archive is `animation-mcp-0.2.0-rc.1.tgz`, built from `35ecc25924fa6e1c1e7f8313e0bb26a43a4fbe75`. Its SHA-256 was verified at close of day:

```text
90d0785fcc6cae5477e8444b73e9d2a6ca00f98a0b19cfa6cf18ed481c81f773
```

| Installed-candidate check | Observed result |
| --- | --- |
| Offline playback | Chromium 159.0.8154.6 played the order-fulfillment SVG. The marker reached x=60, 295 and 530 at the start, midpoint and after the end. Reload restarted playback. The browser made zero external requests. |
| Output write failure | A regular file at the configured output directory caused export to return an error and preserved that file. After the obstruction was removed, export succeeded on the same stdio connection. |
| Largest supported scene dimensions and keyframe counts | Export succeeded for a 1920×1080 SVG with a 30-second timeline, 64 layers, and 120 keyframes per layer. |

The local handoff folder is `~/Documents/Animation-MCP-Pilot/rc1-uklr4nra/`. It contains the archive, SHA-256 manifest, source revision, installed dependency SBOM, collected dependency notices, verification results, sample SVG, and second-workstation instructions.

**Resume point:** The pilot owner still needs to identify the second Mac and representative user. The user should complete the describe, preview, revise, export and offline playback journey there. Distribution terms, notice completeness, dependency advisory review, and owner sign-off remain open under the [pilot acceptance criteria](singapore-macos-arm64-pilot.md#release-acceptance).

The [scene implementation](../src/scene.ts) supports rectangles, circles, text, and linear position and opacity keyframes. The [stdio entry point](../src/index.ts) owns tool registration and format selection. The [export implementation](../src/export.ts) owns local writes, per-export directories, and video subprocesses. The default output root is the OS temporary directory. Choose a retained location for files users expect to find later. The installed package still includes Playwright as a Node dependency even when SVG mode requires no browser binary for export.

## Milestones

Owner names below identify roles to assign. The sequence and usability targets are proposals. The [pilot acceptance criteria](singapore-macos-arm64-pilot.md#release-acceptance) govern release approval.

| Order | Accountable role | Work and evidence required to finish |
| --- | --- | --- |
| 1. Prove the business journey | Pilot owner and one representative user | Choose one real internal workflow and an approved or synthetic brief. Have the user describe it in Codex, preview a meaningful intermediate state, request one revision, export, locate the file, and reopen it offline. Record elapsed time, assistance needed, and whether the owner accepts the sequence and labels. Proposed usability target: one accepted animation and one correction without hand-editing JSON. |
| 2. Qualify the SVG package | Engineering | Build from an identified commit, retain the tarball, checksum, installed SBOM, notices, and distribution terms. Run the installed-package test plus browser checks for start, midpoint, final hold and replay. Exercise invalid input, the largest planned SVG scene, output write failure and recovery. Record the actual tool timeout and output location. Review dependency findings against the organization's policy. |
| 3. Reproduce on a second Mac | IT and the pilot user | Install the candidate privately on a clean macOS ARM64 workstation using documented dependencies. Configure the SVG profile and retained output directory. Confirm discovery, complete the same user journey, and play the file offline in the designated browser. Record OS, Node, browser and package hash, failures and workarounds. Verify the procedure to disable or restore the installation. |
| 4. Decide on the pilot | Pilot owner | Review the same archive's evidence against the pilot checklist. Record participating users, allowed data, output retention, support contact and unresolved issues. Authorize private distribution only after the applicable gates pass. |

If the observed user struggles to produce a readable workflow, first determine whether the cause is scene authoring in Codex, the available drawing primitives, or how the browser displays the output. Use that evidence to select the smallest change. For example, revise a prompt example for incorrect sequencing, or add an agreed diagram primitive if placement repeatedly requires manual intervention.

## Separate video decision

MP4 and WebM remain optional video workflows. A business case requiring delivery to a video-only destination should name the destination, player and recipient before engineering qualifies a codec. The [commercial license audit](v1.1-commercial-license-audit.md) records the outstanding decisions. Independent video licensing and playback acceptance apply to a future video-enabled rollout. The current pilot can qualify SVG on its own schedule.

## Evidence provenance

KB-MCP project-scoped recall returned no project decision for Animation-MCP. Its registry supplied the active `mcp:tool-contract-and-e2e-audit` procedure for comparing advertised tools with observable results. Project facts above come from the committed source, the [installed-package check](../scripts/verify-release.mjs), live stdio requests, and the existing pilot record. The roadmap describes future work and confers no release approval.
