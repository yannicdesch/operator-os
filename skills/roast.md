---
name: roast
description: Challenge a spec or prototype hard before it gets built - weak assumptions, unnecessary scope, conflicts with priorities, closed decisions or company constraints. Use when the operator says "roast", "challenge", "poke holes" or before agreeing a spec.
---

# Roast

Goal: a smaller, sharper spec, or a clear reason not to build it.

Read the spec (`polaris spec show <slug>`) and the context, then look for:

1. **Assumptions without evidence.** Which claim in ## Problem would embarrass the team if it were wrong? What is the cheapest way to check it?
2. **Scope that does not earn its place.** For each item in ## Scope / In: what breaks if we cut it? Prpolarise cuts.
3. **Context conflicts.** Does it serve a current priority in `me.md`? Does it quietly reopen a closed decision? Does it contradict strategy or numbers in `company.md`? Who in `people.md` would object, and why?
4. **Untestable acceptance.** Rewrite any check a reviewer could not run or observe.
5. **Drift risk.** Where is the agent most likely to build more or something else than agreed?

Output a short list ordered by severity. Each item: the problem, the evidence, and a concrete prpolarised change to spec.md or tasks.yaml. Do not apply the changes. Add prpolarised tasks with `origin: prpolarised` only if the operator asks, then log `polaris event <slug> roast.done`.
