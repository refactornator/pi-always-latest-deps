import { describe, expect, it } from "vitest";
import { evaluate } from "./package-manager-interceptor.mjs";

const makeFs = (presentFiles = []) => ({
  existsSync: (p) => presentFiles.some((f) => p.endsWith(f)),
});

const preToolUse = (toolName, file_path, extra = {}) => ({
  hook_event_name: "PreToolUse",
  tool_name: toolName,
  cwd: "/project",
  tool_input: { file_path, ...extra },
});

describe("evaluate (package.json detection)", () => {
  it("blocks Write to package.json and recommends npm install when no lockfile", () => {
    const result = evaluate(preToolUse("Write", "/project/package.json"), makeFs([]));
    expect(result).toEqual({ command: "npm install", fileName: "package.json" });
  });

  it("recommends bun add when bun.lockb is present", () => {
    const result = evaluate(preToolUse("Edit", "/project/package.json"), makeFs(["bun.lockb"]));
    expect(result).toEqual({ command: "bun add", fileName: "package.json" });
  });

  it("recommends bun add when bun.lock is present", () => {
    const result = evaluate(preToolUse("Edit", "/project/package.json"), makeFs(["bun.lock"]));
    expect(result).toEqual({ command: "bun add", fileName: "package.json" });
  });

  it("recommends pnpm add when pnpm-lock.yaml is present", () => {
    const result = evaluate(preToolUse("Edit", "/project/sub/dir/package.json"), makeFs(["pnpm-lock.yaml"]));
    expect(result).toEqual({ command: "pnpm add", fileName: "package.json" });
  });

  it("recommends yarn add when yarn.lock is present", () => {
    const result = evaluate(preToolUse("Write", "/root/app/package.json"), makeFs(["yarn.lock"]));
    expect(result).toEqual({ command: "yarn add", fileName: "package.json" });
  });

  it("recommends deno add when deno.lock is present", () => {
    const result = evaluate(preToolUse("Write", "/root/app/package.json"), makeFs(["deno.lock"]));
    expect(result).toEqual({ command: "deno add", fileName: "package.json" });
  });

  it("recommends deno add when deno.json is present", () => {
    const result = evaluate(preToolUse("Write", "/root/app/package.json"), makeFs(["deno.json"]));
    expect(result).toEqual({ command: "deno add", fileName: "package.json" });
  });

  it("recommends npm install when only package-lock.json is present", () => {
    const result = evaluate(preToolUse("Write", "/project/package.json"), makeFs(["package-lock.json"]));
    expect(result).toEqual({ command: "npm install", fileName: "package.json" });
  });

  it("matches MultiEdit too", () => {
    const result = evaluate(preToolUse("MultiEdit", "/project/package.json"), makeFs([]));
    expect(result).toEqual({ command: "npm install", fileName: "package.json" });
  });

  it("resolves a relative file_path against the payload cwd to find the lockfile", () => {
    const result = evaluate(preToolUse("Edit", "package.json"), makeFs(["pnpm-lock.yaml"]));
    expect(result).toEqual({ command: "pnpm add", fileName: "package.json" });
  });
});

describe("evaluate (static managers)", () => {
  const cases = [
    ["requirements.txt", "pip install"],
    ["Gemfile", "bundle add"],
    ["Cargo.toml", "cargo add"],
    ["go.mod", "go get"],
    ["deno.json", "deno add"],
    ["deno.jsonc", "deno add"],
  ];

  for (const [fileName, command] of cases) {
    it(`blocks ${fileName} and recommends '${command}'`, () => {
      const result = evaluate(preToolUse("Write", `/project/${fileName}`), makeFs([]));
      expect(result).toEqual({ command, fileName });
    });
  }
});

describe("evaluate (no-op cases)", () => {
  it("ignores unrelated files", () => {
    expect(evaluate(preToolUse("Write", "/project/src/main.ts"), makeFs([]))).toBeUndefined();
    expect(evaluate(preToolUse("Edit", "/project/README.md"), makeFs([]))).toBeUndefined();
  });

  it("ignores tool calls with no file_path", () => {
    const payload = {
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      cwd: "/project",
      tool_input: {},
    };
    expect(evaluate(payload, makeFs([]))).toBeUndefined();
  });

  it("ignores tools that aren't Write/Edit/MultiEdit", () => {
    expect(evaluate(preToolUse("Bash", "/project/package.json"), makeFs([]))).toBeUndefined();
    expect(evaluate(preToolUse("Read", "/project/package.json"), makeFs([]))).toBeUndefined();
  });

  it("ignores non-PreToolUse events", () => {
    const payload = {
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      cwd: "/project",
      tool_input: { file_path: "/project/package.json" },
    };
    expect(evaluate(payload, makeFs([]))).toBeUndefined();
  });

  it("ignores empty / null payloads", () => {
    expect(evaluate(undefined, makeFs([]))).toBeUndefined();
    expect(evaluate(null, makeFs([]))).toBeUndefined();
    expect(evaluate({}, makeFs([]))).toBeUndefined();
  });
});
