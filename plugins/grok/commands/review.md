---
description: Have xAI Grok (grok) review your current git diff — read-only
argument-hint: "[--base <ref>] [--model <name>] [optional focus instructions]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(git:*)
---

Run a Grok code review against local git state and return its output verbatim.

Raw arguments:
$ARGUMENTS

Behavior:
- By default, review the working tree (uncommitted changes + untracked files).
- If `--base <ref>` is given, review `<ref>...HEAD` instead.
- Any leftover text is passed as extra reviewer focus.

Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" review $ARGUMENTS
```

Rules:
- This command is review-only. Do not fix issues, apply patches, or edit files.
- Return the command's stdout exactly as-is. Do not paraphrase or summarize.
- If the output says there is nothing to review, relay that and stop.
- If the output says `grok` is not installed, tell the user to run `/grok:setup`.
