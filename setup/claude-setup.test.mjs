import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LOCAL_COMMAND_PATH,
  LOCAL_HOOK_PATH,
  LOCAL_IMPORT_PATH,
  MANAGED_HOOK_COMMAND,
} from "./claude-renderers.mjs";
import {
  detectProjectRoot,
  setupClaudeProject,
} from "./claude-setup.mjs";

const tempDirs = [];

function createTempProject() {
  const tempDir = mkdtempSync(join(tmpdir(), "always-latest-deps-"));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("Claude setup", () => {
  it("creates local Claude shims for a fresh project", () => {
    const projectRoot = createTempProject();
    writeFileSync(join(projectRoot, "package.json"), "{}\n");

    const result = setupClaudeProject({ projectRoot });

    expect(result.changes.some((change) => change.status === "created")).toBe(true);
    expect(existsSync(join(projectRoot, LOCAL_IMPORT_PATH))).toBe(true);
    expect(existsSync(join(projectRoot, LOCAL_HOOK_PATH))).toBe(true);
    expect(existsSync(join(projectRoot, LOCAL_COMMAND_PATH))).toBe(true);
    expect(readFileSync(join(projectRoot, "CLAUDE.md"), "utf8")).toContain(
      "@.claude/imports/always-latest-deps.md",
    );
    expect(readFileSync(join(projectRoot, ".claude/settings.json"), "utf8")).toContain(
      MANAGED_HOOK_COMMAND,
    );
  });

  it("preserves custom project Claude memory and stays idempotent", () => {
    const projectRoot = createTempProject();
    writeFileSync(join(projectRoot, "package.json"), "{}\n");
    writeFileSync(
      join(projectRoot, "CLAUDE.md"),
      "# Project Claude Memory\n\nShared project instructions live in @AGENTS.md.\n",
    );

    setupClaudeProject({ projectRoot });
    const claudeText = readFileSync(join(projectRoot, "CLAUDE.md"), "utf8");

    expect(claudeText).toContain("@AGENTS.md");
    expect(claudeText.match(/BEGIN always-latest-deps managed block/g)).toHaveLength(1);

    const rerun = setupClaudeProject({ projectRoot });
    expect(rerun.changes.every((change) => change.status === "unchanged")).toBe(true);
  });

  it("merges managed hook settings without clobbering user hooks", () => {
    const projectRoot = createTempProject();
    writeFileSync(join(projectRoot, "package.json"), "{}\n");
    mkdirSync(join(projectRoot, ".claude"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".claude/settings.json"),
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  {
                    type: "command",
                    command: "echo keep-me",
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    setupClaudeProject({ projectRoot });

    const settings = JSON.parse(readFileSync(join(projectRoot, ".claude/settings.json"), "utf8"));
    const commands = settings.hooks.PreToolUse.flatMap((entry) => entry.hooks.map((hook) => hook.command));

    expect(commands).toContain("echo keep-me");
    expect(commands.filter((command) => command === MANAGED_HOOK_COMMAND)).toHaveLength(1);
  });

  it("fails safely on invalid Claude settings JSON", () => {
    const projectRoot = createTempProject();
    writeFileSync(join(projectRoot, "package.json"), "{}\n");
    mkdirSync(join(projectRoot, ".claude"), { recursive: true });
    writeFileSync(join(projectRoot, ".claude/settings.json"), "{ invalid json\n");

    expect(() => setupClaudeProject({ projectRoot })).toThrow(/Invalid JSON in \.claude\/settings\.json/);
  });

  it("finds the project root from nested working directories", () => {
    const projectRoot = createTempProject();
    const nestedDir = join(projectRoot, "packages/app");

    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(join(projectRoot, "package.json"), "{}\n");

    expect(detectProjectRoot(nestedDir)).toBe(projectRoot);
  });
});
