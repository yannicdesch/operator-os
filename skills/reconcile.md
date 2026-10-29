---
name: reconcile
description: Compare what was built with what was agreed and surface drift, missing proof and pending decisions. Use after implementation, before review, or when the operator asks "did we ship what we agreed?".
---

# Reconcile

1. Run `opos reconcile <slug> --git-diff` (add `--base main` for a branch).
2. For each finding, explain it in one line and propose the fix:
   - **Proof pending**: run the check and attach evidence, or set the task back to `doing`.
   - **Drift**: either claim the file in an existing task, add a `discovered` task, or revert the change.
   - **Waiting for your decision**: list the proposed tasks and ask the operator yes or no.
3. Do not mark anything done on the operator's behalf. Work backed by proof goes to the operator for approval.
