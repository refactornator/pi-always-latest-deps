import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { packCurrentPackage } from "./published-package.mjs";

const tempDirs = [];
const originalTarballOverride = process.env.ALD_TEST_TARBALL;

afterEach(async () => {
  if (originalTarballOverride === undefined) {
    delete process.env.ALD_TEST_TARBALL;
  } else {
    process.env.ALD_TEST_TARBALL = originalTarballOverride;
  }

  while (tempDirs.length > 0) {
    await rm(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("published package helper", () => {
  it("uses ALD_TEST_TARBALL when provided", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "always-latest-deps-override-"));
    tempDirs.push(tempDir);

    const tarballPath = join(tempDir, "fixture.tgz");
    await writeFile(tarballPath, "not a real tarball, just an existing file");
    process.env.ALD_TEST_TARBALL = tarballPath;

    const packed = await packCurrentPackage();

    expect(packed.tarballPath).toBe(tarballPath);
    await expect(packed.cleanup()).resolves.toBeUndefined();
  });

  it("throws when ALD_TEST_TARBALL points to a missing file", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "always-latest-deps-missing-"));
    tempDirs.push(tempDir);

    process.env.ALD_TEST_TARBALL = join(tempDir, "missing.tgz");

    await expect(packCurrentPackage()).rejects.toThrow(/ALD_TEST_TARBALL/);
  });
});
