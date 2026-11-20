# DietLedger sketch storyboard pack

## Start here

- **[Review gallery](index.html)** — four journey boards, shared flow, individual animation boards and text descriptions.
- **[Contact sheet](contact-sheet.png)** — all path/shared boards on one page.
- **[Visitor-facing scripts](../ideas/dietledger-adventure-scripts.md)** — the full copy behind these compositions.

Open `index.html` in a browser; no server, Node build, CDN, or application backend is required. Everything in this pack is local. For a local HTTP preview instead, run `python3 -m http.server --bind 127.0.0.1 --directory docs/storyboards 8765` from the repository root and open `http://127.0.0.1:8765/` on that machine.

## What's included

| Board | Composition coverage | Animation studies |
| --- | --- | --- |
| [Personal](boards/path-personal.png) | Morning → recipe discovery → planning/shopping → reflection and ownership | P1–P4 |
| [Family](boards/path-family.png) | Tonight → the week → shopping → recipes worth keeping | F1–F4 |
| [Schools](boards/path-schools.png) | Lunch possibilities → recipe nutrition → preparation → school pilot | S1–S4 |
| [Care](boards/path-care.png) | Person first → context → preparation → care pilot | C1–C4 |
| [Shared flow](boards/path-shared.png) | Opening → care fork → own/pilot workspace → beginner/experienced setup | O1, G1, H1 |

**24 boards in total:** 4 journey boards + 1 shared-flow board + 19 separate animation boards. Every board is supplied as a 1800 × 1580 PNG and an editable SVG under `boards/`. Each animation board contains four ordered, labeled keyframes: **76 motion keyframes** overall. One animation study covers the complete motion sequence within its scene, including its linked entrance/exit beats; it is not a separate board for every individual leaf, line, or card.

The path boards show a representative composition for each chapter, not a screenshot of the finished layout. The family book chapter deliberately shows the intermediate book-to-workspace composition so its main storytelling object remains visible.

## Art direction

Warm sketchbook paper, imperfect double pencil lines, sparse hatching, restrained botanical green and copper. The original `public/logo.svg` mark is embedded unchanged, not redrawn. Original schematic artwork is generated locally; no stock or AI-image-service assets are used.

The sketch palette describes shapes and movement, not the final deep-emerald/brand-color lighting. Text uses installed fonts during preview rasterization; editable SVGs include sensible font fallbacks. The generator prefers Comic Sans MS for a hand-lettered review-board feel. Fonts are not redistributed with this pack.

## How to read an animation board

- Read upper-left → upper-right → lower-left → lower-right.
- Percentages are normalized keyframes for discussion, **not a mandatory playback clock**.
- Each board gives a proposed native SVG/CSS technique and a meaningful static reduced-motion alternative. Timing values are draft targets for short effects, not timed slideshow durations or measured performance claims.
- Actions are illustrative. In the finished experience, visitors must be able to advance, go back, change path, or reach setup without waiting for animation.
- Motion notes and drawings are a preproduction contract, not a claim that these transitions already run. Intermediate drawings communicate the intended visual idea; exact path morphing and mobile composition still require prototype review.

## No videos or pretend demos

These are **static sketches of browser-native code animations**. No video, GIF, playback engine, renderer service, animation framework, or runtime dependency is introduced.

Recipe cards, meal plans, lists, and workspace windows are explicitly **concept illustrations**, not captured DietLedger UI. Demo IDs D1–D6 refer back to the scripts' proposed genuine product demonstrations. No footage was recorded. Any later real-product proof must be clearly separate from these illustrations and must not imply unsupported automation, clinical certification, school-meal compliance, procurement, or health outcomes.

Personal dietary discovery remains editable screening, not medical advice. Schools and care are target audiences and pilot stories, not operational validation. Both pilot endings carry visible beta/review boundaries. Self-hosting endings explain responsibility; they do not install anything or promise a single-command or OS-specific deployment.

## Source and regeneration

Metadata:
- `source/personal-family.json`: P1–P4, F1–F4.
- `source/care-school-shared.json`: S1–S4, C1–C4, O1, G1, H1.
- `source/manifest.json`: generated consolidated review manifest.
- `source/render_boards.py`: deterministic SVG drawing source, PNG previews, contact sheet, and gallery generation.

Art-generation prerequisites (not application dependencies): Python 3, Pillow, and ImageMagick with SVG support (`magick`). The current machine already provides these. Font paths are declared at the top of the renderer; adapt them if regenerating on a different OS. Reading the already-generated PNGs/gallery needs none of those tools.

```sh
python3 docs/storyboards/source/render_boards.py
python3 docs/storyboards/source/verify_boards.py
```

Regeneration overwrites this pack's generated boards, gallery, contact sheet, and consolidated manifest. Edit the two input JSON files for captions and timing; edit the renderer for drawings. Do not hand-edit generated SVGs expecting those edits to survive regeneration. For a manual art revision, preserve a separately named version first.

## Review and verification

This is a documentation/artwork change. Instead of app TDD, verification uses manifest/schema and coverage checks, SVG XML parsing, image dimension/readability checks, relative-link/fragment checks, generation-time text wrapping limits, and visual inspection. No application behavior, production service, or live data was changed. Browser verification of the eventual interactive funnel is still required before implementation is accepted.
