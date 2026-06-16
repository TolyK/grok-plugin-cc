---
description: Have xAI Grok (grok) review your current git diff — read-only
argument-hint: "[--base <ref>] [--model <name>] [optional focus instructions]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(git:*)
---

Run a Grok code review against local git state and return its output verbatim.

Raw user input:
$ARGUMENTS

How to run it:
- Invoke the companion with a single `Bash` call:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" review [flags] -- "<optional reviewer focus>"
  ```
- Pass any recognized flags (`--base <ref>`, `--model`/`-m`, `--effort`, `--cwd`, `--timeout`) *before* the `--`.
- Pass any remaining free-text focus as **one single-quoted argument after `--`**. Never splice the raw input straight into the shell — it may contain characters the shell would interpret (`$`, backticks, `;`, quotes, `()`). If there is no extra focus text, omit the `--` part entirely.

Behavior:
- By default, review the working tree (uncommitted changes + untracked files).
- If `--base <ref>` is given, review `<ref>...HEAD` instead.

Rules:
- This command is review-only. Do not fix issues, apply patches, or edit files.
- Return the command's stdout exactly as-is. Do not paraphrase or summarize.
- If the output says there is nothing to review, relay that and stop.
- If the output says `grok` is not installed, tell the user to run `/grok:setup`.
