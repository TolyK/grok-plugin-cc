# Grok plugin for Claude Code

Use [xAI's Grok Build CLI](https://x.ai/news/grok-build-cli) (`grok`) from inside [Claude Code](https://claude.com/claude-code). Delegate tasks, ask one-shot questions, and review code — all without leaving your Claude Code session.

> **Unofficial.** This is a community wrapper. It is not affiliated with, endorsed by, or supported by xAI or Anthropic. "Grok" and "Claude" are trademarks of their respective owners.

This project mirrors the structure of [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc), but wraps the Grok Build CLI instead of Codex.

## What you get

| Command | What it does |
| --- | --- |
| `/grok:rescue [task]` | Delegate a coding task to Grok (read + **edit** files in the repo) via a forwarding subagent. |
| `/grok:ask [question]` | One-shot, **read-only** question to Grok. |
| `/grok:review [--base <ref>]` | Have Grok review your current git diff (read-only). |
| `/grok:setup` | Check that `grok` is installed and authenticated. |

There's also a `grok:grok-rescue` subagent that Claude can invoke proactively to hand off substantial work.

## Prerequisites

1. **Node.js** (the companion script is plain ESM, no dependencies).
2. **The Grok Build CLI (`grok`)**, installed and authenticated:

   ```bash
   # macOS / Linux
   curl -fsSL https://x.ai/cli/install.sh | bash
   # Windows PowerShell
   irm https://x.ai/cli/install.ps1 | iex
   ```

   Then run `grok login` once and complete sign-in, or set `XAI_API_KEY` (get a key at [console.x.ai](https://console.x.ai)).

Run `/grok:setup` from Claude Code to verify both. Grok installs to `~/.grok/bin/grok`, which isn't always on Claude Code's `PATH` — if it can't be found, set `GROK_BIN` to the full path.

## Install the plugin

Add this repo as a plugin marketplace, then install the `grok` plugin:

```
/plugin marketplace add TolyK/grok-plugin-cc
/plugin install grok@grok-cc
```

(Or clone the repo and add it as a local marketplace with `/plugin marketplace add ./grok-plugin-cc`.)

## Usage

```
/grok:setup
/grok:ask how does the auth middleware in this repo work?
/grok:rescue add input validation to the signup handler and a test for it
/grok:review --base main
```

`/grok:rescue` is write-capable by default — Grok may edit files. Pass `--read-only` for a no-edit pass. `/grok:ask` and `/grok:review` are always read-only.

## How it works

Everything is a thin pass-through to Grok's headless mode (`grok -p "<prompt>"`). The companion script (`plugins/grok/scripts/grok-companion.mjs`) runs `grok` once, captures its stdout, strips ANSI, and filters Grok's stderr tracing noise (e.g. an unreachable local MCP server, auth warnings) so Claude Code receives clean text. The commands and subagent return Grok's output verbatim.

Read-only vs write:

- **Write (`task` / `/grok:rescue`):** runs with `--always-approve` so tool execution (edits, shell) is auto-approved and the headless run never blocks waiting for confirmation.
- **Read-only (`ask` / `review`):** adds `--sandbox read-only`, Grok's **OS-level** sandbox (Seatbelt on macOS, Landlock on Linux). It allows reads everywhere but permits writes only to `~/.grok` and temp dirs, while the model/network keeps working. This is a real kernel-enforced guard, not just a prompt.

  Why the sandbox rather than tool flags: in current Grok versions the per-invocation `--tools` / `--disallowed-tools` / `--permission-mode` flags are **not reliably honored** (and a global `permission_mode = "always-approve"` in `~/.grok/config.toml` overrides them), so they can't be trusted to prevent edits. The sandbox can.

  **Caveat:** on platforms where the sandbox can't be applied (Windows, or an unsupported kernel), Grok warns and runs unsandboxed — read-only then falls back to the prompt instruction only.

## Flags

The companion (`grok-companion.mjs <ask|task|review|setup>`) accepts:

| Flag | Meaning |
| --- | --- |
| `--model`, `-m <name>` | Pass a specific model to `grok`. |
| `--effort <level>` | Reasoning effort: `low`, `medium`, `high`, `xhigh`, `max`. |
| `--cwd <path>` | Working directory for the run. |
| `--resume`, `-c` | Continue the most recent Grok session for this directory. |
| `--session-id <id>` | Resume a specific Grok session by id. |
| `--output-format <fmt>` | `plain` (default), `json`, or `streaming-json`. |
| `--read-only` | Forbid file edits (default for `ask`/`review`). |
| `--timeout <seconds>` | Hard-kill the run after N seconds (default 600). |
| `--base <ref>` | (`review` only) diff against `<ref>` instead of the working tree. |

> **Note on `grok` flags:** the Grok CLI is young and its flags may shift between releases. The companion relies on the stable headless `-p` mode plus documented headless-only flags (`--permission-mode`, `--disallowed-tools`, `--effort`, `--output-format`). If a flag is rejected by your `grok` version, update the companion or drop the flag. PRs welcome.

## Layout

```
grok-plugin-cc/
├── .claude-plugin/marketplace.json        # marketplace manifest
└── plugins/grok/
    ├── .claude-plugin/plugin.json         # plugin manifest
    ├── commands/                          # /grok:rescue|ask|review|setup
    ├── agents/grok-rescue.md              # forwarding subagent
    └── scripts/grok-companion.mjs         # the bridge to `grok`
```

## License

[MIT](./LICENSE)
