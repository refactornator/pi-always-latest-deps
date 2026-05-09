import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

import { packCurrentPackage } from "../integration/helpers/published-package.mjs";

function spawnCapture(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolveResult({ code, stdout, stderr });
    });
  });
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function formatResult(result) {
  return [
    `exit code: ${result.code}`,
    "stdout:",
    result.stdout || "<empty>",
    "stderr:",
    result.stderr || "<empty>",
  ].join("\n");
}

async function makeTempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function run(command, args, options = {}) {
  return spawnCapture(command, args, options);
}

async function extractTarball({ tarballPath, directory }) {
  const result = await run("tar", ["-xzf", tarballPath, "-C", directory]);

  if (result.code !== 0) {
    throw new Error(
      `Failed to extract tarball with ${formatCommand("tar", ["-xzf", tarballPath, "-C", directory])}\n${formatResult(result)}`,
    );
  }

  return join(directory, "package");
}

async function repackTarball({ extractedRoot, outputTarballPath }) {
  const result = await run("tar", ["-czf", outputTarballPath, "-C", extractedRoot, "package"]);

  if (result.code !== 0) {
    throw new Error(
      `Failed to repack tarball with ${formatCommand("tar", ["-czf", outputTarballPath, "-C", extractedRoot, "package"])}\n${formatResult(result)}`,
    );
  }
}

async function mutateTarball({ label, baseTarballPath, mutate }) {
  const workDir = await makeTempDir(`always-latest-deps-proof-${label}-`);
  const outputTarballPath = join(workDir, `${label}.tgz`);

  try {
    const packageDir = await extractTarball({ tarballPath: baseTarballPath, directory: workDir });
    await mutate(packageDir);
    await repackTarball({ extractedRoot: workDir, outputTarballPath });

    return {
      tarballPath: outputTarballPath,
      cleanup: async () => {
        await rm(workDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(workDir, { recursive: true, force: true });
    throw error;
  }
}

function getVitestCommand() {
  return {
    command: process.execPath,
    args: [
      resolve(process.cwd(), "node_modules/vitest/vitest.mjs"),
      "--run",
      "--config",
      "vitest.integration.config.ts",
    ],
  };
}

async function runVitestAgainstTarball({ tarballPath, testFile, testNamePattern }) {
  const vitest = getVitestCommand();
  const args = [...vitest.args, testFile];

  if (testNamePattern) {
    args.push("--testNamePattern", testNamePattern);
  }

  return run(vitest.command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ALD_TEST_TARBALL: tarballPath,
    },
  });
}

function assertPass(result, label) {
  if (result.code !== 0) {
    throw new Error(`${label} was expected to pass but failed.\n${formatResult(result)}`);
  }
}

function assertFail(result, label, expectedFragments = []) {
  if (result.code === 0) {
    throw new Error(`${label} was expected to fail but passed.\n${formatResult(result)}`);
  }

  if (expectedFragments.length === 0) {
    return;
  }

  const output = `${result.stdout}\n${result.stderr}`;
  const missingFragments = expectedFragments.filter((fragment) => !output.includes(fragment));

  if (missingFragments.length > 0) {
    throw new Error(
      `${label} failed, but the output did not include the expected fragments: ${missingFragments.join(", ")}\n${formatResult(result)}`,
    );
  }
}

async function mutateClaudeHookExport(packageDir) {
  const packageJsonPath = join(packageDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.exports["./claude-hook"] = "./claude/hooks/missing-hook.mjs";
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function mutatePiExtensionToNoop(packageDir) {
  await writeFile(
    join(packageDir, "extensions/package-manager-interceptor.ts"),
    "export default function () {}\n",
  );
}

async function main() {
  const cleanups = [];

  try {
    const healthy = await packCurrentPackage();
    cleanups.push(healthy.cleanup);

    const healthyBaseline = await runVitestAgainstTarball({
      tarballPath: healthy.tarballPath,
      testFile: "integration/claude-consumer.test.mjs",
    });
    assertPass(healthyBaseline, "Healthy Claude integration baseline");

    const healthyPiBaseline = await runVitestAgainstTarball({
      tarballPath: healthy.tarballPath,
      testFile: "integration/pi-package.test.mjs",
    });
    assertPass(healthyPiBaseline, "Healthy Pi integration baseline");

    const brokenClaude = await mutateTarball({
      label: "claude-hook-export-broken",
      baseTarballPath: healthy.tarballPath,
      mutate: mutateClaudeHookExport,
    });
    cleanups.push(brokenClaude.cleanup);

    const brokenClaudeResult = await runVitestAgainstTarball({
      tarballPath: brokenClaude.tarballPath,
      testFile: "integration/claude-consumer.test.mjs",
      testNamePattern: "executes the generated Claude hook shim and denies package.json edits with detected yarn guidance",
    });
    assertFail(brokenClaudeResult, "Broken Claude hook export proof", [
      "executes the generated Claude hook shim and denies package.json edits with detected yarn guidance",
    ]);

    const brokenPi = await mutateTarball({
      label: "pi-extension-noop",
      baseTarballPath: healthy.tarballPath,
      mutate: mutatePiExtensionToNoop,
    });
    cleanups.push(brokenPi.cleanup);

    const brokenPiResult = await runVitestAgainstTarball({
      tarballPath: brokenPi.tarballPath,
      testFile: "integration/pi-package.test.mjs",
      testNamePattern: "loads the packaged Pi extension and blocks package.json edits using real lockfile detection",
    });
    assertFail(brokenPiResult, "Broken Pi extension proof", [
      "loads the packaged Pi extension and blocks package.json edits using real lockfile detection",
    ]);

    process.stdout.write("Integration proof succeeded: healthy tarball passes and broken tarballs fail targeted tests.\n");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`prove-integration-tests-work: ${message}\n`);
    return 1;
  } finally {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      await cleanup?.();
    }
  }
}

if (!existsSync(resolve(process.cwd(), "node_modules/vitest/vitest.mjs"))) {
  process.stderr.write("prove-integration-tests-work: expected local Vitest install at node_modules/vitest/vitest.mjs\n");
  process.exit(1);
}

const exitCode = await main();
process.exit(exitCode);
