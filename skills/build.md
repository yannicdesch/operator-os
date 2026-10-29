---
name: build
description: Implement an agreed polaris spec task by task, keeping tasks.yaml and the event log honest. Use when the operator says "build it", "implement the spec" or "/polaris-build".
---

# Build

1. Only build specs with `status: agreed` or `building`. Otherwise stop and ask.
2. Set `status: building` and work through `tasks.yaml` in order. Before each task set it to `doing`.
3. Stay inside the task's `files` globs. If you must touch something else, add or widen a task and say so.
4. Work you find necessary but nobody agreed to goes in as a new task with `origin: discovered`. Ideas that are nice but not necessary go in with `origin: proposed` and are not built.
5. A task is `done` only with evidence: the test you ran and its result, the file that proves it, or a commit. Add it under `evidence`.
6. When all agreed tasks are done, run `polaris reconcile <slug> --git-diff` and fix anything it flags before handing over.
