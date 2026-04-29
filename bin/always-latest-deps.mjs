#!/usr/bin/env node

import process from "node:process";

import { formatSetupSummary, setupClaudeProject } from "../setup/claude-setup.mjs";

function printUsage(output = process.stdout) {
  output.write(`always-latest-deps

Usage:
  npx always-latest-deps setup
`);
}

async function main(argv = process.argv.slice(2)) {
  const [command] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return 0;
  }

  if (command !== "setup") {
    process.stderr.write(`Unknown command: ${command}\n\n`);
    printUsage(process.stderr);
    return 1;
  }

  try {
    const result = setupClaudeProject();
    process.stdout.write(`${formatSetupSummary(result)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`always-latest-deps setup failed: ${message}\n`);
    return 1;
  }
}

const exitCode = await main();
process.exit(exitCode);
