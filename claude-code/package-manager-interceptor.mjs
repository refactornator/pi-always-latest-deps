#!/usr/bin/env node
// Claude Code PreToolUse hook that blocks direct edits to dependency manifests
// and redirects the agent to the appropriate package manager command.
//
// Wire it up in .claude/settings.json:
//   {
//     "hooks": {
//       "PreToolUse": [
//         {
//           "matcher": "Write|Edit|MultiEdit",
//           "hooks": [
//             { "type": "command", "command": "node /abs/path/claude-code/package-manager-interceptor.mjs" }
//           ]
//         }
//       ]
//     }
//   }

import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const STATIC_MANAGERS = {
  "requirements.txt": "pip install",
  "Gemfile": "bundle add",
  "Cargo.toml": "cargo add",
  "go.mod": "go get",
  "deno.json": "deno add",
  "deno.jsonc": "deno add",
};

const TARGETED_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);

// Detect the right JS package manager command by walking up from `dir` looking
// for a lockfile. We bound the walk so we don't traverse the whole filesystem.
function detectJsManager(dir, fs = { existsSync }) {
  let current = dir;
  for (let i = 0; i < 32; i++) {
    if (fs.existsSync(join(current, "bun.lockb")) || fs.existsSync(join(current, "bun.lock"))) return "bun add";
    if (fs.existsSync(join(current, "pnpm-lock.yaml"))) return "pnpm add";
    if (fs.existsSync(join(current, "yarn.lock"))) return "yarn add";
    if (fs.existsSync(join(current, "deno.lock")) || fs.existsSync(join(current, "deno.json"))) return "deno add";
    if (fs.existsSync(join(current, "package-lock.json"))) return "npm install";
    const parent = dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return "npm install";
}

// Decide whether to block, given a hook payload. Returns either undefined
// (allow) or { command, fileName } describing what the agent should run instead.
export function evaluate(payload, fs = { existsSync }) {
  if (!payload || payload.hook_event_name !== "PreToolUse") return undefined;
  if (!TARGETED_TOOLS.has(payload.tool_name)) return undefined;

  const input = payload.tool_input || {};
  const targetPath = input.file_path;
  if (!targetPath) return undefined;

  const fileName = basename(targetPath);
  let command = STATIC_MANAGERS[fileName];

  if (fileName === "package.json") {
    const cwd = payload.cwd || process.cwd();
    const targetDir = isAbsolute(targetPath) ? dirname(targetPath) : join(cwd, dirname(targetPath));
    command = detectJsManager(targetDir, fs);
  }

  if (!command) return undefined;
  return { command, fileName };
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // No JSON on stdin — nothing to do.
    process.exit(0);
  }

  const decision = evaluate(payload);
  if (!decision) process.exit(0);

  const reason = `Don't modify ${decision.fileName} directly to manage dependencies. Run '${decision.command} <package>' in a Bash tool call instead so the package manager picks the latest version.`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

// Only run main when executed directly, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
