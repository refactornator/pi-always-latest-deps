import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";

import { createJiti } from "@mariozechner/jiti";

function spawnCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
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
      resolve({ code, stdout, stderr });
    });

    if (options.stdinJson !== undefined) {
      child.stdin.write(JSON.stringify(options.stdinJson));
    }

    child.stdin.end();
  });
}

function getNpmInvocation() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath],
    };
  }

  const npmSiblingPath = join(dirname(process.execPath), "npm");

  if (existsSync(npmSiblingPath)) {
    return {
      command: npmSiblingPath,
      args: [],
    };
  }

  return {
    command: "npm",
    args: [],
  };
}

async function runNpm(args, options = {}) {
  const npm = getNpmInvocation();
  return spawnCapture(npm.command, [...npm.args, ...args], options);
}

export async function createTempProject() {
  const projectRoot = await mkdtemp(join(tmpdir(), "always-latest-deps-integration-"));

  await writeFile(
    join(projectRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "always-latest-deps-integration-fixture",
        private: true,
      },
      null,
      2,
    )}\n`,
  );

  return {
    projectRoot,
    cleanup: async () => {
      await rm(projectRoot, { recursive: true, force: true });
    },
  };
}

export async function writeProjectFile(projectRoot, relativePath, contents) {
  const absolutePath = join(projectRoot, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

export async function readProjectFile(projectRoot, relativePath) {
  return readFile(join(projectRoot, relativePath), "utf8");
}

export async function readProjectJson(projectRoot, relativePath) {
  return JSON.parse(await readProjectFile(projectRoot, relativePath));
}

export async function packCurrentPackage() {
  if (process.env.ALD_TEST_TARBALL) {
    const tarballPath = process.env.ALD_TEST_TARBALL;

    if (!existsSync(tarballPath)) {
      throw new Error(`ALD_TEST_TARBALL does not exist: ${tarballPath}`);
    }

    return {
      tarballPath,
      cleanup: async () => {},
    };
  }

  const outputDir = await mkdtemp(join(tmpdir(), "always-latest-deps-pack-"));
  const result = await runNpm(["pack", "--json", "--pack-destination", outputDir], {
    cwd: process.cwd(),
  });

  if (result.code !== 0) {
    throw new Error(`npm pack failed\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`);
  }

  const [packInfo] = JSON.parse(result.stdout.trim());
  const tarballPath = join(outputDir, packInfo.filename);

  return {
    tarballPath,
    cleanup: async () => {
      await rm(outputDir, { recursive: true, force: true });
    },
  };
}

export async function installPackedPackage({
  projectRoot,
  tarballPath,
  extraPackages = [],
}) {
  const result = await runNpm([
    "install",
    "--no-save",
    tarballPath,
    ...extraPackages,
  ], {
    cwd: projectRoot,
  });

  if (result.code !== 0) {
    throw new Error(`npm install failed\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`);
  }

  return result;
}

export function getInstalledPackageRoot(projectRoot, packageName = "always-latest-deps") {
  return join(projectRoot, "node_modules", packageName);
}

export async function runNode({
  cwd,
  entryPath,
  args = [],
  stdinJson,
}) {
  return spawnCapture(process.execPath, [entryPath, ...args], {
    cwd,
    stdinJson,
  });
}

export async function loadTsDefaultExport(entryPath, options = {}) {
  const jiti = createJiti(entryPath, {
    fsCache: false,
    moduleCache: false,
    alias: options.alias ?? {},
  });

  return jiti.import(entryPath, { default: true });
}
