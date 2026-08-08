---
name: feedback-terse-responses
description: User prefers terse, structured responses — no trailing summaries, no re-capping code already shown
metadata:
  type: feedback
---

Do not add trailing "Summary of changes" sections after implementing fixes. Do not re-state what was just done. The diff and the structured response body (Bug Summary / Root Cause / Fix Approach / Code Changes) are sufficient.

**Why:** User can read the diff. Redundant summaries waste space.

**How to apply:** End the response after the last verified output. Never add a "What was changed" recap paragraph at the bottom.
