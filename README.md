# always-latest-deps

![CI](https://github.com/refactornator/always-latest-deps/actions/workflows/test.yml/badge.svg)

> Prevent stale AI-generated dependency versions from being installed — a tiny cross-agent package for fresher dependency installs 🌻

## What is this?

`always-latest-deps` keeps Pi and Claude from hand-editing dependency manifests and pushes dependency changes through the right package manager command instead.

That matters because AI coding agents often add dependencies by editing files like `package.json` directly and pinning whatever version they happened to generate. That can mean:

- out-of-date packages
- old APIs
- avoidable security issues
- fresh tech debt on day one

This package fixes that problem early.

Instead of letting the agent write dependency versions by hand, it forces the workflow through commands like:

- `npm install <package>`
- `pnpm add <package>`
- `yarn add <package>`
- `bun add <package>`
- `pip install <package>`
- `cargo add <package>`

That way, the coding agent starts from the newest available dependency version in the ecosystem, rather than from an outdated guessed version.

## Quickstart

```bash
npm install -D always-latest-deps
```

### Claude Code

Run the explicit setup step once:

```bash
npx always-latest-deps setup
```

That command:

- writes project-local Claude shims under `.claude/`
- merges a managed import block into `CLAUDE.md`
- merges the managed hook entry into `.claude/settings.json`

After setup, Claude will block direct dependency-manifest edits and point itself back to the right package-manager command.

### Pi

Pi support is package-native. Once the package is installed and available to Pi, it uses the same shared dependency policy automatically through the Pi adapter.

### Updating

If you upgrade `always-latest-deps`, rerun:

```bash
npx always-latest-deps setup
```

That refreshes only the managed Claude shim content and preserves your project-owned guidance around it.

## Architecture

This repository now keeps dependency-policy logic in one shared core so the behavior stays aligned across:

- the Pi adapter
- Claude Code hooks
- Claude Code memory, slash-command guidance, and local Claude setup shims

The shared policy lives in `shared/dependency-policy.mjs`. Thin adapters translate that policy into:

- Pi `tool_call` blocks in `extensions/package-manager-interceptor.ts`
- Claude `PreToolUse` hook decisions in `claude/hooks/dependency-manifest-guard.mjs`
- generated Claude bundle text and local setup shims via `setup/claude-renderers.mjs` and `setup/claude-setup.mjs`

## Why it’s useful

This project is really about **catching dependency drift before it starts**.

By stopping direct manifest edits, it helps AI agents:

- install the freshest dependency version available
- avoid implementing against outdated APIs
- reduce the chance of pulling in known vulnerabilities
- avoid baking unnecessary upgrade work into a brand new feature

In short: it prevents a common “bad first step” that can quietly turn into security problems and long-term maintenance cost.

## What it supports

### JavaScript / TypeScript
- `package.json`
  - auto-detects `npm`, `pnpm`, `yarn`, `bun`, or `deno` from lockfiles

### Other ecosystems
- `requirements.txt` → `pip install`
- `Gemfile` → `bundle add`
- `Cargo.toml` → `cargo add`
- `go.mod` → `go get`
- `deno.json` / `deno.jsonc` → `deno add`

## The core idea

**Don’t let the agent guess dependency versions by editing files. Make it ask the package manager for the latest sane version instead.**

## Claude Code support

This repo includes Claude Code assets built from the same shared policy:

- `CLAUDE.md` as a tiny repo-local memory file with a managed import block
- `.claude/imports/always-latest-deps.md` as the local Claude memory shim
- `.claude/hooks/always-latest-deps.mjs` as the local hook shim
- `.claude/settings.json` as the project-owned hook config
- `.claude/commands/add-dependency.md` as the local slash-command shim
- `claude/skill/CLAUDE.md` as the reusable Claude bundle
- `claude/examples/project-CLAUDE.md` as an example for consuming projects

The setup command creates or updates project-local shims so Claude reads stable local paths instead of importing policy directly from `node_modules`.

The naming split is intentional:

- root `CLAUDE.md` belongs to the current repository and stays project-owned
- project-local `.claude/*` files are generated shims owned by the setup command
- `claude/skill/CLAUDE.md` is the portable Claude-specific policy file shipped by the package
- `AGENTS.md` remains the cross-agent project source of truth, so project guidance does not need to be duplicated in multiple memory files

For a consuming project, the setup command produces the clean pattern:

```md
# Project Claude Memory

Shared project instructions live in @AGENTS.md.

<!-- BEGIN always-latest-deps managed block -->
@.claude/imports/always-latest-deps.md
<!-- END always-latest-deps managed block -->
```

If you change supported manifests or command guidance in this package:

```bash
npm run generate:claude
npm run setup:self
```

## Published package workflow

For consumers, the intended flow is:

```bash
npm install -D always-latest-deps
npx always-latest-deps setup
```

That gives you:

- shared dependency-policy logic across Pi and Claude
- project-local Claude shims with stable local paths
- a project-owned `CLAUDE.md` instead of package-owned project memory
- one explicit setup command instead of hidden postinstall behavior
