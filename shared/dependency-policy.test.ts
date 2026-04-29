import { describe, expect, it, vi } from "vitest";

import {
  evaluateDependencyManifestEdit,
  formatClaudeDenyReason,
  formatInterceptionNotification,
  formatPiBlockReason,
  renderSupportedManifestSummary,
  resolveTargetDirectory,
} from "./dependency-policy.mjs";

describe("dependency policy core", () => {
  it("uses npm install for package.json when no known lockfile exists", () => {
    const result = evaluateDependencyManifestEdit(
      {
        cwd: "/workspace/project",
        targetPath: "/workspace/project/package.json",
      },
      {
        existsSync: vi.fn(() => false),
      },
    );

    expect(result).toEqual({
      fileName: "package.json",
      command: "npm install",
      targetDir: "/workspace/project",
    });
  });

  it("prefers bun over other package managers when bun lockfiles exist", () => {
    const result = evaluateDependencyManifestEdit(
      {
        cwd: "/workspace/project",
        targetPath: "/workspace/project/package.json",
      },
      {
        existsSync: vi.fn((path) => path.endsWith("/bun.lockb")),
      },
    );

    expect(result?.command).toBe("bun add");
  });

  it("detects pnpm for nested relative package.json paths", () => {
    const result = evaluateDependencyManifestEdit(
      {
        cwd: "/workspace/project",
        targetPath: "packages/api/package.json",
      },
      {
        existsSync: vi.fn((path) => path.endsWith("/packages/api/pnpm-lock.yaml")),
      },
    );

    expect(result).toEqual({
      fileName: "package.json",
      command: "pnpm add",
      targetDir: "/workspace/project/packages/api",
    });
  });

  it("maps static manifests to their package-manager commands", () => {
    const result = evaluateDependencyManifestEdit(
      {
        cwd: "/workspace/project",
        targetPath: "requirements.txt",
      },
      {
        existsSync: vi.fn(() => false),
      },
    );

    expect(result).toEqual({
      fileName: "requirements.txt",
      command: "pip install",
      targetDir: "/workspace/project",
    });
  });

  it("ignores unsupported files", () => {
    const result = evaluateDependencyManifestEdit(
      {
        cwd: "/workspace/project",
        targetPath: "src/main.ts",
      },
      {
        existsSync: vi.fn(() => false),
      },
    );

    expect(result).toBeNull();
  });

  it("returns null when the target path is missing", () => {
    const result = evaluateDependencyManifestEdit(
      {
        cwd: "/workspace/project",
      },
      {
        existsSync: vi.fn(() => false),
      },
    );

    expect(result).toBeNull();
  });

  it("formats shared messages consistently", () => {
    const decision = {
      fileName: "package.json",
      command: "npm install",
      targetDir: "/workspace/project",
    };

    expect(formatInterceptionNotification(decision)).toBe(
      "Intercepted direct modification to package.json. Redirecting to use npm install.",
    );
    expect(formatPiBlockReason(decision)).toBe(
      "Blocked by extension. Do not modify package.json directly to manage dependencies. Please use the bash tool to run 'npm install <package>' instead.",
    );
    expect(formatClaudeDenyReason(decision)).toBe(
      "Do not modify package.json directly to manage dependencies. Use the Bash tool to run 'npm install <package>' instead.",
    );
  });

  it("renders a markdown summary for generated Claude assets", () => {
    const summary = renderSupportedManifestSummary();

    expect(summary).toContain("`package.json`");
    expect(summary).toContain("`pnpm add`");
    expect(summary).toContain("`requirements.txt`");
  });

  it("resolves absolute and relative target directories predictably", () => {
    expect(
      resolveTargetDirectory({
        cwd: "/workspace/project",
        targetPath: "/workspace/project/package.json",
      }),
    ).toBe("/workspace/project");

    expect(
      resolveTargetDirectory({
        cwd: "/workspace/project",
        targetPath: "packages/app/package.json",
      }),
    ).toBe("/workspace/project/packages/app");
  });
});
