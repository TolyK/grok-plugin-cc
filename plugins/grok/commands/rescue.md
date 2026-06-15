---
description: Delegate a coding task to xAI Grok (grok) — it can read and edit files in this repo
argument-hint: "[--read-only] [--model <name>] [--effort <level>] [--resume] [what Grok should do]"
allowed-tools: Bash(node:*), Agent
---

Invoke the `grok:grok-rescue` subagent via the `Agent` tool (`subagent_type: "grok:grok-rescue"`), forwarding the raw user request below as the prompt.

`grok:grok-rescue` is a subagent, not a skill — do not call it via `Skill(...)`, and do not re-run `/grok:rescue` (that re-enters this command and hangs the session). This command runs inline so the `Agent` tool stays in scope.

The final user-visible response must be Grok's output verbatim — do not paraphrase, summarize, or add commentary before or after it.

Raw user request:
$ARGUMENTS

Routing rules:
- Forward `--read-only`, `--model`, `--effort`, `--resume`, and `--session-id` to the subagent as-is; do not treat them as part of the natural-language task.
- If the user gave no actual task, ask what Grok should do instead of forwarding an empty request.
- If the subagent reports that `grok` is not installed, tell the user to run `/grok:setup`.
