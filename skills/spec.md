---
name: spec
description: Shape a feature or change into an polaris spec (spec.md, tasks.yaml, events.jsonl) that is tied to the operator's priorities and open decisions. Use when the operator asks to spec, scope or plan work, or says "/polaris-spec".
---

# Spec

Goal: one agreed document the coding agent builds against.

1. If the request is still vague, run the polaris-interview-me workflow first.
2. Create the spec: `polaris spec new "<title>" --priority "<me.md priority>" [--decision "<open decision>"] [--stakeholder "<name>"]...`
   Pick the priority and decision from the context. If none fits, leave the flag out and say why in ## Context.
3. Fill `spec.md`:
   - **Problem**: who has it, what it costs today, the evidence.
   - **Context**: the priority it serves, the open decision it feeds, what `company.md` says that constrains it, which stakeholders care and why.
   - **Scope**: In and Out. Out is as important as In.
   - **Decisions**: settled calls with a one-line reason.
   - **Open questions**: only the ones that change the work, each with who can answer it.
   - **Acceptance**: checks a reviewer can run or observe.
4. Fill `tasks.yaml`. One task per acceptance check or coherent slice. Every agreed task gets `checks` and the `files` globs it may touch. Use `origin: prpolarised` for anything you suggest beyond what the operator asked for.
5. Run `polaris spec check <slug>` and fix every error. Explain any warning you leave.
6. Show the operator the scope, the decisions and the open questions, and ask them to agree. Only when they agree: set `status: agreed` in the frontmatter and run `polaris event <slug> spec.agreed`.
