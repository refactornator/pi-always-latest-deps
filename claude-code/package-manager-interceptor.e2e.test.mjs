import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "package-manager-interceptor.mjs");

const runHook = (payload) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });

describe("hook subprocess", () => {
  it("emits a deny decision when editing package.json with a yarn.lock present", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claude-hook-"));
    writeFileSync(join(dir, "yarn.lock"), "");
    const { code, stdout } = await runHook({
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      cwd: dir,
      tool_input: { file_path: join(dir, "package.json") },
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain("yarn add");
  });

  it("exits silently for an unrelated file", async () => {
    const { code, stdout } = await runHook({
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      cwd: "/tmp",
      tool_input: { file_path: "/tmp/README.md" },
    });
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("exits 0 on garbage stdin without crashing", async () => {
    const child = spawn(process.execPath, [HOOK], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.end("not json");
    const code = await new Promise((resolve) => child.on("close", resolve));
    expect(code).toBe(0);
  });
});
