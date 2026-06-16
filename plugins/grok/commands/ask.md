---
description: Ask xAI Grok (grok) a one-shot question — read-only, no file edits
argument-hint: "[--model <name>] [--effort <level>] <your question>"
allowed-tools: Bash(node:*)
---

Run the Grok companion in read-only `ask` mode and return its output verbatim.

Raw user input:
$ARGUMENTS

How to run it:
- Invoke the companion with a single `Bash` call:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" ask [flags] -- "<the user's question>"
  ```
- Pass the user's question as **one single-quoted argument after `--`**. Never splice the raw input straight into the shell — it may contain quotes, `$`, backticks, `;`, `&&`, or `()` that the shell would otherwise interpret. Put everything after `--` so the companion treats it as the prompt, and quote it safely.
- If the raw input begins with recognized flags (`--model`/`-m`, `--effort`, `--cwd`, `--resume`/`-c`, `--session-id`, `--output-format`, `--timeout`), pass those *before* the `--`; everything else is the question.

Rules:
- This is read-only. Grok will not edit files in this mode.
- Return the command's stdout exactly as-is. Do not paraphrase, summarize, or add commentary.
- If the output says `grok` is not installed, tell the user to run `/grok:setup`.
- If the user provided no question, ask them what they want to ask Grok.
