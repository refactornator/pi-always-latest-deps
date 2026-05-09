import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";

import {
  createTempProject,
  getInstalledPackageRoot,
  installPackedPackage,
  packCurrentPackage,
  readProjectFile,
  runNode,
  writeProjectFile,
} from "./helpers/published-package.mjs";

describe("Claude consumer integration", () => {
  let packed;

  beforeAll(async () => {
    packed = await packCurrentPackage();
  });

  afterAll(async () => {
    await packed?.cleanup();
  });

  it("runs the packaged setup command and creates local Claude shims", async () => {
    const temp = await createTempProject();

    try {
      await installPackedPackage({
        projectRoot: temp.projectRoot,
        tarballPath: packed.tarballPath,
      });

      const installedRoot = getInstalledPackageRoot(temp.projectRoot);
      const result = await runNode({
        cwd: temp.projectRoot,
        entryPath: join(installedRoot, "bin/always-latest-deps.mjs"),
        args: ["setup"],
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Configured always-latest-deps in");

      await expect(readProjectFile(temp.projectRoot, "CLAUDE.md")).resolves.toContain(
        "@.claude/imports/always-latest-deps.md",
      );
      await expect(
        readProjectFile(temp.projectRoot, ".claude/imports/always-latest-deps.md"),
      ).resolves.toContain("Always Latest Dependencies");
      await expect(
        readProjectFile(temp.projectRoot, ".claude/hooks/always-latest-deps.mjs"),
      ).resolves.toContain('from "always-latest-deps/claude-hook"');
      await expect(
        readProjectFile(temp.projectRoot, ".claude/commands/add-dependency.md"),
      ).resolves.toContain("Add or update a dependency");
      await expect(
        readProjectFile(temp.projectRoot, ".claude/settings.json"),
      ).resolves.toContain(
        "node $CLAUDE_PROJECT_DIR/.claude/hooks/always-latest-deps.mjs",
      );
    } finally {
      await temp.cleanup();
    }
  });

  it("executes the generated Claude hook shim and denies package.json edits with detected yarn guidance", async () => {
    const temp = await createTempProject();

    try {
      await installPackedPackage({
        projectRoot: temp.projectRoot,
        tarballPath: packed.tarballPath,
      });

      const installedRoot = getInstalledPackageRoot(temp.projectRoot);
      await writeProjectFile(temp.projectRoot, "yarn.lock", "");
      await writeProjectFile(temp.projectRoot, "src/index.ts", "export {};\n");

      const setupResult = await runNode({
        cwd: temp.projectRoot,
        entryPath: join(installedRoot, "bin/always-latest-deps.mjs"),
        args: ["setup"],
      });

      expect(setupResult.code).toBe(0);

      const denyResult = await runNode({
        cwd: temp.projectRoot,
        entryPath: join(temp.projectRoot, ".claude/hooks/always-latest-deps.mjs"),
        stdinJson: {
          cwd: temp.projectRoot,
          tool_input: {
            file_path: join(temp.projectRoot, "package.json"),
          },
        },
      });

      expect(denyResult.code).toBe(0);

      const decision = JSON.parse(denyResult.stdout);
      expect(decision.hookSpecificOutput.hookEventName).toBe("PreToolUse");
      expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(decision.hookSpecificOutput.permissionDecisionReason).toContain(
        "yarn add <package>",
      );

      const allowResult = await runNode({
        cwd: temp.projectRoot,
        entryPath: join(temp.projectRoot, ".claude/hooks/always-latest-deps.mjs"),
        stdinJson: {
          cwd: temp.projectRoot,
          tool_input: {
            file_path: join(temp.projectRoot, "src/index.ts"),
          },
        },
      });

      expect(allowResult.code).toBe(0);
      expect(allowResult.stdout.trim()).toBe("");
    } finally {
      await temp.cleanup();
    }
  });
});
