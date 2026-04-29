import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderConsumerProjectClaudeTemplate,
  renderPackageClaudeBundle,
} from "../setup/claude-renderers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function writeFile(relativePath, contents) {
  const absolutePath = resolve(projectRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${contents}\n`);
}

writeFile("claude/skill/CLAUDE.md", renderPackageClaudeBundle());
writeFile("claude/examples/project-CLAUDE.md", renderConsumerProjectClaudeTemplate());
