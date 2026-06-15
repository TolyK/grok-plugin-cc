#!/usr/bin/env node
// Grok Companion — a thin, dependency-free bridge between Claude Code and
// xAI's Grok Build CLI (`grok`).
//
// What it does:
//   Wraps `grok -p "<prompt>"` (headless / single-turn mode) so Claude Code can
//   delegate tasks, ask one-shot questions, and review diffs with Grok, then
//   returns Grok's answer verbatim.
//
// Why a wrapper at all:
//   `grok -p` already works fine under a non-TTY stdout (Claude Code's Bash
//   tool), printing its answer to stdout. But it also emits tracing/log noise
//   on stderr (e.g. an unreachable local MCP server, auth warnings). This
//   companion captures stdout only, strips ANSI, and filters that stderr noise
//   so Claude Code receives clean text. It also maps a small, stable flag set
//   onto Grok's headless flags and enforces read-only mode for ask/review.
//
// Subcommands:
//   setup  [--json]                 Check that `grok` is installed and (best
//                                   effort) authenticated.
//   ask    [opts] <prompt...>       One-shot, read-only question to Grok.
//   task   [opts] <prompt...>       Delegate a (write-capable) task. Defaults to
//                                   auto-approving tool use so it can run
//                                   unattended; pass --read-only to forbid edits.
//   review [opts] [extra focus...]  Review the current git diff (read-only).
//
// Common options:
//   --model, -m <name>     Pass a specific model to `grok` (best effort).
//   --effort <level>       low|medium|high|xhigh|max (best effort).
//   --cwd <path>           Working directory to run `grok` in.
//   --resume, -c           Continue the most recent Grok session (this cwd).
//   --session-id <id>      Resume a specific Grok session by id.
//   --output-format <fmt>  plain|json|streaming-json (default plain).
//   --timeout <seconds>    Hard kill the run after N seconds (default 600).
//   --write / --read-only  Force tool-use auto-approval on/off.
//   review-only:
//     --base <ref>         Diff against <ref> (e.g. main) instead of working tree.

import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// locate the grok binary
// ---------------------------------------------------------------------------

// Grok installs to ~/.grok/bin/grok, which is not always on the PATH that
// Claude Code's Bash tool inherits. Resolve in order: $GROK_BIN, `grok` on
// PATH, then the default install location.
function resolveGrokBin() {
  if (process.env.GROK_BIN) return process.env.GROK_BIN;
  if (hasBinary("grok")) return "grok";
  const fallback = path.join(os.homedir(), ".grok", "bin", "grok");
  try {
    fs.accessSync(fallback, fs.constants.X_OK);
    return fallback;
  } catch {
    return "grok"; // let it fail loudly with a clear message
  }
}

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------

const BOOL_FLAGS = new Set([
  "--json",
  "--write",
  "--read-only",
  "--resume",
  "-c",
  "--continue",
]);
const VALUE_FLAGS = new Set([
  "--model",
  "-m",
  "--effort",
  "--cwd",
  "--session-id",
  "--output-format",
  "--timeout",
  "--base",
]);

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (BOOL_FLAGS.has(a)) {
      flags[a.replace(/^-+/, "")] = true;
    } else if (VALUE_FLAGS.has(a)) {
      flags[a.replace(/^-+/, "")] = argv[++i];
    } else if (a.startsWith("--") && a.includes("=")) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      flags[k] = v;
    } else {
      rest.push(a);
    }
  }
  // normalize aliases
  if (flags.m && !flags.model) flags.model = flags.m;
  if (flags.c || flags.continue) flags.resume = true;
  return { flags, rest };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function hasBinary(name) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [name], {
    encoding: "utf8",
  });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function stripAnsi(s) {
  return String(s)
    // CSI / ANSI escape sequences
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "")
    // OSC sequences
    .replace(/\x1B\][^\x07]*\x07/g, "")
    .replace(/\x1B[@-Z\\-_]/g, "")
    .replace(/\r/g, "");
}

// Grok logs tracing lines to stderr that are not part of the answer, e.g.
//   2026-06-15T23:15:16.985Z ERROR worker quit with fatal: ...
//   2026-06-15T23:15:16.986Z ERROR ... Auth(AuthorizationRequired)
// Drop timestamped tracing lines and known-noise lines so we don't surface
// them to the user when we fall back to stderr.
function denoiseStderr(s) {
  return stripAnsi(s)
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) return false; // tracing
      if (/worker quit with fatal/i.test(t)) return false;
      if (/AuthorizationRequired/i.test(t)) return false;
      if (/127\.0\.0\.1:\d+\/mcp/i.test(t)) return false; // unreachable local MCP
      return true;
    })
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// run grok once
// ---------------------------------------------------------------------------

function runGrok(grokArgs, { timeoutMs, cwd }) {
  const GROK_BIN = resolveGrokBin();
  return new Promise((resolve) => {
    const child = spawn(GROK_BIN, grokArgs, {
      cwd: cwd || process.cwd(),
      env: process.env,
      // `grok -p` is non-interactive; give it no stdin so it can't block.
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let out = "";
    let err = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
      }, 3000);
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout: "", stderr: String(e.message), spawnError: true });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: killed ? 124 : code ?? 0,
        stdout: stripAnsi(out).trim(),
        stderr: denoiseStderr(err),
        timedOut: killed,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// build the `grok` argument list shared by ask/task/review
// ---------------------------------------------------------------------------

function buildGrokArgs(prompt, flags, { write }) {
  const args = ["-p", prompt];
  if (flags.model) args.push("-m", flags.model);
  if (flags.effort) args.push("--effort", flags.effort);
  args.push("--output-format", flags["output-format"] || "plain");

  // session continuity
  if (flags["session-id"]) {
    args.push("-r", flags["session-id"]); // resume a specific session
  } else if (flags.resume) {
    args.push("-c"); // continue the most recent session for this cwd
  }

  // Auto-approve tool execution so a headless run never blocks waiting for a
  // confirmation that can't be given.
  args.push("--always-approve");

  // Read-only enforcement.
  //
  // grok's per-invocation tool/permission flags (--tools, --disallowed-tools,
  // --permission-mode) are NOT reliably honored in current versions, and the
  // user's global config may set permission_mode = "always-approve". The only
  // dependable guard is grok's OS-level sandbox (Seatbelt on macOS, Landlock on
  // Linux). The built-in `read-only` profile allows reads everywhere but permits
  // writes only to ~/.grok and temp dirs, and the model/network keeps working.
  //
  // Caveat: on platforms where the sandbox can't be applied (e.g. Windows, or an
  // unsupported kernel) grok warns and runs unsandboxed — read-only then falls
  // back to the prompt instruction only. See README.
  if (!write) {
    args.push("--sandbox", "read-only");
  }
  return args;
}

// ---------------------------------------------------------------------------
// subcommands
// ---------------------------------------------------------------------------

async function cmdSetup(flags) {
  const GROK_BIN = resolveGrokBin();
  const installed = hasBinary(GROK_BIN) || /[\\/]/.test(GROK_BIN);
  let version = null;
  if (installed) {
    const r = spawnSync(GROK_BIN, ["--version"], { encoding: "utf8" });
    if (r.status !== 0 && r.error) {
      // GROK_BIN pointed somewhere unusable
      version = null;
    } else {
      version = stripAnsi((r.stdout || r.stderr || "").trim()) || "unknown";
    }
  }
  const reallyInstalled = installed && version !== null;

  // Best-effort auth heuristic: env key or the credentials file grok writes.
  const home = os.homedir();
  const hasEnvKey = !!process.env.XAI_API_KEY;
  const authFile = path.join(home, ".grok", "auth.json");
  let hasAuthFile = false;
  try {
    hasAuthFile = fs.statSync(authFile).size > 0;
  } catch {}
  const likelyAuthed = hasEnvKey || hasAuthFile;

  const status = {
    installed: reallyInstalled,
    version,
    binary: GROK_BIN,
    likelyAuthenticated: likelyAuthed,
    authSignal: hasEnvKey ? "XAI_API_KEY" : hasAuthFile ? "auth.json" : "none",
  };

  if (flags.json) {
    process.stdout.write(JSON.stringify(status, null, 2) + "\n");
    return reallyInstalled ? 0 : 1;
  }

  const lines = [];
  if (!reallyInstalled) {
    lines.push("❌ Grok Build CLI (`grok`) is not installed or not on PATH.");
    lines.push("");
    lines.push("Install it:");
    lines.push("  macOS/Linux:  curl -fsSL https://x.ai/cli/install.sh | bash");
    lines.push("  Windows:      irm https://x.ai/cli/install.ps1 | iex");
    lines.push("");
    lines.push("If it is installed but not found, set GROK_BIN to its full path");
    lines.push("(default install location is ~/.grok/bin/grok).");
  } else {
    lines.push(`✅ Grok Build CLI installed (${version}).`);
    if (likelyAuthed) {
      lines.push(`✅ Looks authenticated (${status.authSignal}).`);
    } else {
      lines.push("⚠️  Could not detect credentials.");
      lines.push("   Sign in with:  grok login   (then complete sign-in)");
      lines.push("   Or set XAI_API_KEY in your environment (get one at console.x.ai).");
    }
  }
  process.stdout.write(lines.join("\n") + "\n");
  return reallyInstalled ? 0 : 1;
}

function ensureReady() {
  const GROK_BIN = resolveGrokBin();
  const ok = hasBinary(GROK_BIN) || /[\\/]/.test(GROK_BIN);
  if (!ok) {
    process.stdout.write(
      "❌ Grok Build CLI (`grok`) is not installed. Run `/grok:setup` for install instructions.\n"
    );
    process.exit(1);
  }
}

async function cmdRun(flags, rest, { write, label }) {
  ensureReady();
  const prompt = rest.join(" ").trim();
  if (!prompt) {
    process.stdout.write(`❌ No prompt provided for ${label}.\n`);
    return 1;
  }
  const timeoutMs = (Number(flags.timeout) || 600) * 1000;
  const args = buildGrokArgs(prompt, flags, { write });
  const res = await runGrok(args, { timeoutMs, cwd: flags.cwd });

  if (res.spawnError) {
    process.stdout.write(`❌ Failed to launch \`grok\`: ${res.stderr}\n`);
    return 127;
  }
  if (res.timedOut) {
    process.stdout.write(
      `⏱️  Grok run timed out after ${flags.timeout || 600}s.\n` +
        (res.stdout ? `\nPartial output:\n${res.stdout}\n` : "")
    );
    return 124;
  }
  const body = res.stdout || res.stderr || "(no output returned by grok)";
  process.stdout.write(body + "\n");
  return res.code;
}

async function cmdReview(flags, rest) {
  ensureReady();
  const base = flags.base;
  let diff;
  if (base) {
    diff = spawnSync("git", ["diff", `${base}...HEAD`], { encoding: "utf8" });
  } else {
    diff = spawnSync("git", ["diff", "HEAD"], { encoding: "utf8" });
  }
  let diffText = (diff.stdout || "").trim();

  if (!base) {
    const untracked = spawnSync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { encoding: "utf8" }
    );
    const files = (untracked.stdout || "").trim();
    if (files) diffText += `\n\n# Untracked files (not shown in diff):\n${files}`;
  }

  if (!diffText) {
    process.stdout.write("Nothing to review — no diff detected.\n");
    return 0;
  }

  const focus = rest.join(" ").trim();
  const prompt = [
    "You are reviewing a code change. Do NOT modify any files — this is a read-only review.",
    "Report concrete correctness bugs, security issues, and risky changes. Be specific:",
    "cite file and line, explain the impact, and suggest a fix. Skip nitpicks unless they matter.",
    focus ? `\nReviewer focus: ${focus}` : "",
    "\nHere is the change to review:\n",
    "```diff",
    diffText,
    "```",
  ]
    .filter(Boolean)
    .join("\n");

  const timeoutMs = (Number(flags.timeout) || 600) * 1000;
  const args = buildGrokArgs(prompt, flags, { write: false });
  const res = await runGrok(args, { timeoutMs, cwd: flags.cwd });

  if (res.spawnError) {
    process.stdout.write(`❌ Failed to launch \`grok\`: ${res.stderr}\n`);
    return 127;
  }
  process.stdout.write((res.stdout || res.stderr || "(no output)") + "\n");
  return res.code;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const [sub, ...raw] = process.argv.slice(2);
  const { flags, rest } = parseArgs(raw);

  // --read-only overrides --write; task defaults to write-capable.
  const writeForTask = flags["read-only"] ? false : true;

  switch (sub) {
    case "setup":
      return cmdSetup(flags);
    case "ask":
      return cmdRun(flags, rest, { write: false, label: "ask" });
    case "task":
      return cmdRun(flags, rest, { write: writeForTask, label: "task" });
    case "review":
      return cmdReview(flags, rest);
    default:
      process.stdout.write(
        "Usage: grok-companion.mjs <setup|ask|task|review> [options] [prompt...]\n"
      );
      return 2;
  }
}

main().then((code) => process.exit(code ?? 0));
