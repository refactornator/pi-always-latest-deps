import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { join } from "node:path";

import {
  createTempProject,
  getInstalledPackageRoot,
  installPackedPackage,
  loadTsDefaultExport,
  packCurrentPackage,
  readProjectFile,
  readProjectJson,
  writeProjectFile,
} from "./helpers/published-package.mjs";

function createMockPi() {
  const listeners = {};

  return {
    on(event, listener) {
      listeners[event] ??= [];
      listeners[event].push(listener);
    },
    async emit(event, payload, ctx) {
      for (const listener of listeners[event] ?? []) {
        const result = await listener(payload, ctx);

        if (result) {
          return result;
        }
      }

      return undefined;
    },
  };
}

describe("Pi packaged extension integration", () => {
  let packed;

  beforeAll(async () => {
    packed = await packCurrentPackage();
  });

  afterAll(async () => {
    await packed?.cleanup();
  });

  it("ships the Pi extension entrypoint in the packed package", async () => {
    const temp = await createTempProject();

    try {
      await installPackedPackage({
        projectRoot: temp.projectRoot,
        tarballPath: packed.tarballPath,
      });

      const packageJson = await readProjectJson(
        temp.projectRoot,
        "node_modules/always-latest-deps/package.json",
      );

      expect(packageJson.pi?.extensions).toContain("./extensions");
      await expect(
        readProjectFile(
          temp.projectRoot,
          "node_modules/always-latest-deps/extensions/package-manager-interceptor.ts",
        ),
      ).resolves.toContain("evaluateDependencyManifestEdit");
      await expect(
        readProjectFile(
          temp.projectRoot,
          "node_modules/always-latest-deps/shared/dependency-policy.mjs",
        ),
      ).resolves.toContain("resolveDependencyCommand");
    } finally {
      await temp.cleanup();
    }
  });

  it("loads the packaged Pi extension and blocks package.json edits using real lockfile detection", async () => {
    const temp = await createTempProject();

    try {
      await installPackedPackage({
        projectRoot: temp.projectRoot,
        tarballPath: packed.tarballPath,
      });

      await writeProjectFile(temp.projectRoot, "pnpm-lock.yaml", "");
      await writeProjectFile(temp.projectRoot, "README.md", "# fixture\n");

      const installedRoot = getInstalledPackageRoot(temp.projectRoot);
      const extension = await loadTsDefaultExport(
        join(installedRoot, "extensions/package-manager-interceptor.ts"),
        {
          alias: {
            "@mariozechner/pi-coding-agent": join(
              process.cwd(),
              "node_modules/@mariozechner/pi-coding-agent/dist/index.js",
            ),
          },
        },
      );

      const pi = createMockPi();
      const ctx = {
        cwd: temp.projectRoot,
        ui: {
          notify: vi.fn(),
        },
      };

      extension(pi);

      const blocked = await pi.emit(
        "tool_call",
        {
          toolName: "write",
          input: {
            path: join(temp.projectRoot, "package.json"),
            content: "{}\n",
          },
        },
        ctx,
      );

      expect(blocked).toMatchObject({
        block: true,
        reason: expect.stringContaining("pnpm add <package>"),
      });
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Redirecting to use pnpm add."),
        "warning",
      );

      const allowed = await pi.emit(
        "tool_call",
        {
          toolName: "write",
          input: {
            path: join(temp.projectRoot, "README.md"),
            content: "# updated\n",
          },
        },
        ctx,
      );

      expect(allowed).toBeUndefined();
    } finally {
      await temp.cleanup();
    }
  });
});
