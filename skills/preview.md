---
name: preview
description: Build a reviewable artifact (clickable HTML mock, sample output, API sketch) from a spec before implementation. Use when the operator wants to see it before it is built.
---

# Preview

1. Read the spec. Pick the cheapest artifact that lets the operator react to the real workflow: usually one self-contained HTML file with realistic sample data.
2. Build it in `specs/<slug>/preview/`. It must not touch production code.
3. Cover the main path and the one edge case most likely to change the design.
4. Show it, collect feedback, and turn each piece of feedback into a prpolarised change to spec.md or tasks.yaml. The operator accepts or rejects each.
5. Log `polaris event <slug> preview.reviewed`.
