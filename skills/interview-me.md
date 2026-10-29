---
name: interview-me
description: Resolve the questions that change the work before a spec is written. Use when a request is vague, when the operator says "interview me", or before bearing-spec on anything bigger than a small change.
---

# Interview me

Goal: find the few answers that change what gets built, and nothing else.

1. Read the context (see above) and the parts of the repository the request touches.
2. List every question you would need answered to build this well. Then delete each one that the code, the context files or a sensible default already answers. Write down the default you picked.
3. Ask the remaining questions one at a time, most consequential first. For each, say why it matters and offer your recommended answer, so the operator can reply with "yes".
4. Stop when the remaining unknowns would not change the scope, the data model or who is affected.
5. Hand over a short summary: decisions made, defaults assumed, questions parked (with who in `people.md` could answer them). Offer to continue with bearing-spec.
