import { existsSync } from "node:fs";
import {
  basename as nodeBasename,
  dirname as nodeDirname,
  isAbsolute as nodeIsAbsolute,
  join as nodeJoin,
} from "node:path";

export const STATIC_MANAGERS = Object.freeze({
  "requirements.txt": "pip install",
  Gemfile: "bundle add",
  "Cargo.toml": "cargo add",
  "go.mod": "go get",
  "deno.json": "deno add",
  "deno.jsonc": "deno add",
});

export const PACKAGE_JSON_DEFAULT_COMMAND = "npm install";

export const PACKAGE_JSON_LOCKFILE_RULES = Object.freeze([
  Object.freeze({
    command: "bun add",
    evidenceFiles: Object.freeze(["bun.lockb", "bun.lock"]),
  }),
  Object.freeze({
    command: "pnpm add",
    evidenceFiles: Object.freeze(["pnpm-lock.yaml"]),
  }),
  Object.freeze({
    command: "yarn add",
    evidenceFiles: Object.freeze(["yarn.lock"]),
  }),
  Object.freeze({
    command: "deno add",
    evidenceFiles: Object.freeze(["deno.lock", "deno.json"]),
  }),
]);

export const DEPENDENCY_WORKFLOW_PRINCIPLES = Object.freeze([
  "Never guess dependency versions by hand in a manifest file.",
  "Use the package manager that matches the repository lockfiles and ecosystem markers.",
  "Prefer the newest sane version resolved by the ecosystem tool.",
  "Treat direct manifest edits as exceptional and user-directed.",
]);

const DEFAULT_PATH_API = Object.freeze({
  basename: nodeBasename,
  dirname: nodeDirname,
  isAbsolute: nodeIsAbsolute,
  join: nodeJoin,
});

export function getSupportedManifestPolicies() {
  return [
    {
      fileName: "package.json",
      strategy: "auto-detect",
      defaultCommand: PACKAGE_JSON_DEFAULT_COMMAND,
      commands: PACKAGE_JSON_LOCKFILE_RULES.map((rule) => rule.command),
      note: "Auto-detect bun, pnpm, yarn, or deno from lockfiles; default to npm install.",
    },
    ...Object.entries(STATIC_MANAGERS).map(([fileName, command]) => ({
      fileName,
      strategy: "static",
      command,
    })),
  ];
}

export function resolveTargetDirectory({ targetPath, cwd }, deps = {}) {
  const pathApi = deps.pathApi ?? DEFAULT_PATH_API;

  if (pathApi.isAbsolute(targetPath)) {
    return pathApi.dirname(targetPath);
  }

  return pathApi.join(cwd, pathApi.dirname(targetPath));
}

export function resolvePackageJsonCommand(targetDir, deps = {}) {
  const fileExists = deps.existsSync ?? existsSync;
  const pathApi = deps.pathApi ?? DEFAULT_PATH_API;

  for (const rule of PACKAGE_JSON_LOCKFILE_RULES) {
    const hasEvidence = rule.evidenceFiles.some((evidenceFile) =>
      fileExists(pathApi.join(targetDir, evidenceFile)),
    );

    if (hasEvidence) {
      return rule.command;
    }
  }

  return PACKAGE_JSON_DEFAULT_COMMAND;
}

export function resolveDependencyCommand({ fileName, targetDir }, deps = {}) {
  if (fileName === "package.json") {
    return resolvePackageJsonCommand(targetDir, deps);
  }

  return STATIC_MANAGERS[fileName];
}

export function evaluateDependencyManifestEdit(input, deps = {}) {
  const { targetPath, cwd } = input;

  if (!targetPath) {
    return null;
  }

  const pathApi = deps.pathApi ?? DEFAULT_PATH_API;
  const fileName = pathApi.basename(targetPath);
  const targetDir = resolveTargetDirectory({ targetPath, cwd }, { pathApi });
  const command = resolveDependencyCommand({ fileName, targetDir }, deps);

  if (!command) {
    return null;
  }

  return {
    fileName,
    command,
    targetDir,
  };
}

export function formatInterceptionNotification(decision) {
  return `Intercepted direct modification to ${decision.fileName}. Redirecting to use ${decision.command}.`;
}

export function formatPiBlockReason(decision) {
  return `Blocked by extension. Do not modify ${decision.fileName} directly to manage dependencies. Please use the bash tool to run '${decision.command} <package>' instead.`;
}

export function formatClaudeDenyReason(decision) {
  return `Do not modify ${decision.fileName} directly to manage dependencies. Use the Bash tool to run '${decision.command} <package>' instead.`;
}

export function renderSupportedManifestSummary() {
  return getSupportedManifestPolicies()
    .map((policy) => {
      if (policy.fileName === "package.json") {
        const detectedCommands = policy.commands.map((command) => `\`${command}\``).join(", ");
        return `- \`${policy.fileName}\` → ${policy.note} Detects ${detectedCommands}; fallback \`${policy.defaultCommand}\`.`;
      }

      return `- \`${policy.fileName}\` → \`${policy.command}\``;
    })
    .join("\n");
}

export function renderWorkflowPrinciples() {
  return DEPENDENCY_WORKFLOW_PRINCIPLES.map((principle) => `- ${principle}`).join("\n");
}
