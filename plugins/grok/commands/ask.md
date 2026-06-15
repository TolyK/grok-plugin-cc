---
description: Ask xAI Grok (grok) a one-shot question — read-only, no file edits
argument-hint: "[--model <name>] [--effort <level>] <your question>"
allowed-tools: Bash(node:*)
---

Run the Grok companion in read-only `ask` mode and return its output verbatim.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" ask $ARGUMENTS
```

Rules:
- This is read-only. Grok will not edit files in this mode.
- Return the command's stdout exactly as-is. Do not paraphrase, summarize, or add commentary.
- If the output says `grok` is not installed, tell the user to run `/grok:setup`.
- If the user provided no question, ask them what they want to ask Grok.
