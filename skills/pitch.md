---
name: pitch
description: Decide whether an opportunity is worth pursuing - GO, NOT-NOW or NO-GO - against the operator's priorities, open decisions and company numbers. Use when the operator asks "should we build this", "is this worth it" or wants a one-page case.
---

# Pitch

Goal: a decision the operator can make in five minutes.

Write a one-page case with these parts:

1. **The opportunity** in two sentences.
2. **Fit**: which priority in `me.md` it serves and which open decision in `decisions.md` it feeds. If it serves none, say so on the first line.
3. **Value**: what moves, in the units `company.md` uses (revenue, retention, cost, time). Separate measured facts from estimates and label every estimate.
4. **Cost**: build effort, what it pushes out, who has to say yes (from `people.md`).
5. **Kill criterion**: the number and date at which we stop.
6. **Recommendation**: GO, NOT-NOW (with the trigger that would change it) or NO-GO, with the single strongest reason.

Save it as `specs/<slug>/pitch.md` if a spec exists, else print it. If the operator decides, propose the exact line to add under "Recently closed" in `decisions.md` and let them apply it.
