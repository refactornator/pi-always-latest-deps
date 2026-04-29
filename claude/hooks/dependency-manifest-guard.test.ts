import { describe, expect, it, vi } from "vitest";

import { buildClaudeHookDecision } from "./dependency-manifest-guard.mjs";

describe("Claude dependency manifest hook", () => {
  it("returns a deny decision for protected manifests", () => {
    const decision = buildClaudeHookDecision(
      {
        cwd: "/workspace/project",
        tool_input: {
          file_path: "/workspace/project/package.json",
        },
      },
      {
        existsSync: vi.fn((path: string) => path.endsWith("/yarn.lock")),
      },
    );

    expect(decision).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Do not modify package.json directly to manage dependencies. Use the Bash tool to run 'yarn add <package>' instead.",
      },
    });
  });

  it("returns null for unsupported files", () => {
    const decision = buildClaudeHookDecision(
      {
        cwd: "/workspace/project",
        tool_input: {
          file_path: "/workspace/project/src/main.ts",
        },
      },
      {
        existsSync: vi.fn(() => false),
      },
    );

    expect(decision).toBeNull();
  });
});
