import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  evaluateDependencyManifestEdit,
  formatClaudeDenyReason,
} from "../../shared/dependency-policy.mjs";

export function buildClaudeHookDecision(payload, deps = {}) {
  const targetPath =
    payload?.tool_input?.file_path ??
    payload?.tool_input?.path ??
    payload?.file_path ??
    null;
  const cwd =
    typeof payload?.cwd === "string" && payload.cwd.length > 0
      ? payload.cwd
      : deps.cwd ?? process.cwd();

  const decision = evaluateDependencyManifestEdit(
    {
      cwd,
      targetPath,
    },
    deps,
  );

  if (!decision) {
    return null;
  }

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: formatClaudeDenyReason(decision),
    },
  };
}

export async function readJsonFromStdin(stdin = process.stdin) {
  let raw = "";

  for await (const chunk of stdin) {
    raw += chunk;
  }

  if (!raw.trim()) {
    return null;
  }

  return JSON.parse(raw);
}

export async function main({
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  cwd,
} = {}) {
  try {
    const payload = await readJsonFromStdin(stdin);

    if (!payload) {
      return 0;
    }

    const decision = buildClaudeHookDecision(payload, { cwd });

    if (decision) {
      stdout.write(`${JSON.stringify(decision)}\n`);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`dependency-manifest-guard: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await main();
  process.exit(exitCode);
}
