---
description: Check whether xAI's Grok Build CLI (grok) is installed and authenticated
argument-hint: ""
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" setup
```

Then present the output to the user.

- If `grok` is not installed, surface the install command for the user's platform (the script prints both). If it is installed but Claude Code can't find it, mention they can set `GROK_BIN` to its full path (default is `~/.grok/bin/grok`).
- If `grok` is installed but credentials were not detected, tell the user to run `grok login` once in their terminal to complete sign-in, or to set `XAI_API_KEY` (get a key at console.x.ai).
- Do not attempt to install or authenticate `grok` yourself — both steps are interactive and must be run by the user. Suggest they use a `! ` prefixed command (e.g. `! grok login`) to run it inline.
