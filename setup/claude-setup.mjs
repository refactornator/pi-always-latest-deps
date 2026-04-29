import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

import { getSupportedManifestPolicies } from "../shared/dependency-policy.mjs";
import {
  LOCAL_COMMAND_PATH,
  LOCAL_HOOK_PATH,
  LOCAL_IMPORT_PATH,
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START,
  MANAGED_HOOK_COMMAND,
  renderLocalClaudeCommand,
  renderLocalClaudeHookShim,
  renderLocalClaudeImport,
  renderManagedClaudeBlock,
  renderMinimalProjectClaude,
} from "./claude-renderers.mjs";

const ROOT_MARKERS = [
  ".git",
  "package.json",
  "CLAUDE.md",
  "AGENTS.md",
  ...getSupportedManifestPolicies().map((policy) => policy.fileName),
];

const LEGACY_MANAGED_HOOK_COMMANDS = new Set([
  MANAGED_HOOK_COMMAND,
  "node .claude/hooks/always-latest-deps.mjs",
  "node $CLAUDE_PROJECT_DIR/claude/hooks/dependency-manifest-guard.mjs",
]);

function readTextIfExists(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, "utf8");
}

function ensureParentDirectory(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function normalizeOutput(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function writeTextFile(filePath, contents) {
  const nextContents = normalizeOutput(contents);
  const previousContents = readTextIfExists(filePath);

  if (previousContents === nextContents) {
    return {
      path: filePath,
      status: "unchanged",
    };
  }

  ensureParentDirectory(filePath);
  writeFileSync(filePath, nextContents);

  return {
    path: filePath,
    status: previousContents === null ? "created" : "updated",
  };
}

export function detectProjectRoot(startDir = process.cwd()) {
  const initialDir = resolve(startDir);
  let currentDir = initialDir;

  while (true) {
    if (ROOT_MARKERS.some((marker) => existsSync(join(currentDir, marker)))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      return initialDir;
    }

    currentDir = parentDir;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mergeProjectClaudeText(existingText = "") {
  const managedBlock = renderManagedClaudeBlock();

  if (!existingText.trim()) {
    return renderMinimalProjectClaude();
  }

  if (existingText.includes(MANAGED_BLOCK_START) && existingText.includes(MANAGED_BLOCK_END)) {
    const blockPattern = new RegExp(
      `${escapeRegExp(MANAGED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MANAGED_BLOCK_END)}`,
      "m",
    );

    return `${existingText.replace(blockPattern, managedBlock).trimEnd()}\n`;
  }

  return `${existingText.trimEnd()}\n\n${managedBlock}\n`;
}

function isManagedHookEntry(entry) {
  if (!entry || !Array.isArray(entry.hooks)) {
    return false;
  }

  return entry.hooks.some(
    (hook) =>
      hook &&
      hook.type === "command" &&
      typeof hook.command === "string" &&
      LEGACY_MANAGED_HOOK_COMMANDS.has(hook.command),
  );
}

function createManagedPreToolUseEntry() {
  return {
    matcher: "Edit|MultiEdit|Write",
    hooks: [
      {
        type: "command",
        command: MANAGED_HOOK_COMMAND,
      },
    ],
  };
}

function parseSettingsJson(contents) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in .claude/settings.json: ${message}`);
  }
}

export function mergeClaudeSettingsText(existingText = "") {
  const parsedSettings = existingText.trim() ? parseSettingsJson(existingText) : {};
  const hooks = typeof parsedSettings.hooks === "object" && parsedSettings.hooks !== null
    ? parsedSettings.hooks
    : {};
  const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  const nextPreToolUse = preToolUse.filter((entry) => !isManagedHookEntry(entry));

  nextPreToolUse.push(createManagedPreToolUseEntry());

  return `${JSON.stringify(
    {
      ...parsedSettings,
      hooks: {
        ...hooks,
        PreToolUse: nextPreToolUse,
      },
    },
    null,
    2,
  )}\n`;
}

export function setupClaudeProject({ startDir = process.cwd(), projectRoot } = {}) {
  const resolvedProjectRoot = projectRoot ?? detectProjectRoot(startDir);
  const rootClaudePath = join(resolvedProjectRoot, "CLAUDE.md");
  const settingsPath = join(resolvedProjectRoot, ".claude/settings.json");
  const filesToWrite = [
    {
      path: join(resolvedProjectRoot, LOCAL_IMPORT_PATH),
      contents: renderLocalClaudeImport(),
    },
    {
      path: join(resolvedProjectRoot, LOCAL_HOOK_PATH),
      contents: renderLocalClaudeHookShim(),
    },
    {
      path: join(resolvedProjectRoot, LOCAL_COMMAND_PATH),
      contents: renderLocalClaudeCommand(),
    },
    {
      path: rootClaudePath,
      contents: mergeProjectClaudeText(readTextIfExists(rootClaudePath) ?? ""),
    },
    {
      path: settingsPath,
      contents: mergeClaudeSettingsText(readTextIfExists(settingsPath) ?? ""),
    },
  ];

  return {
    projectRoot: resolvedProjectRoot,
    changes: filesToWrite.map((file) => writeTextFile(file.path, file.contents)),
  };
}

export function formatSetupSummary(result) {
  const lines = [
    `Configured always-latest-deps in ${result.projectRoot}`,
    "",
    ...result.changes.map((change) => `- ${change.status}: ${relativeToProject(result.projectRoot, change.path)}`),
  ];

  return lines.join("\n");
}

function relativeToProject(projectRoot, absolutePath) {
  if (!absolutePath.startsWith(projectRoot)) {
    return absolutePath;
  }

  const relativePath = absolutePath.slice(projectRoot.length).replace(/^\/+/, "");
  return relativePath || ".";
}
