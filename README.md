# pi-always-latest-deps

![CI](https://github.com/refactornator/pi-always-latest-deps/actions/workflows/test.yml/badge.svg)

> A Pi extension that prevents installing stale dependencies.

## What is this?

`pi-always-latest-deps` intercepts direct edits to dependency files and pushes the agent toward using the package manager instead.

That matters because AI coding agents often add dependencies by editing files like `package.json` directly and pinning whatever version they happened to generate. That can mean:

- out-of-date packages
- old APIs
- avoidable security issues
- fresh tech debt on day one

This extension fixes that problem early.

Instead of letting the agent write dependency versions by hand, it forces the workflow through commands like:

- `npm install <package>`
- `pnpm add <package>`
- `yarn add <package>`
- `bun add <package>`
- `pip install <package>`
- `cargo add <package>`

That way, the coding agent starts from the newest available dependency version in the ecosystem, rather than from an outdated guessed version.

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

## Use it with Claude Code

This repo also ships as a Claude Code plugin. Install it once and the hook
runs in every project.

### Install

```text
/plugin marketplace add refactornator/pi-always-latest-deps
/plugin install pi-always-latest-deps
```

That's it — no JSON to edit, no per-project setup. The plugin installs to
your user-level Claude Code config so the hook fires across all sessions.

### What happens

When Claude Code is about to call `Write`, `Edit`, or `MultiEdit` on a file like
`package.json`, `Cargo.toml`, `Gemfile`, `go.mod`, `requirements.txt`, or
`deno.json[c]`, the hook returns a `deny` decision and tells Claude to run the
right package-manager command instead — e.g. `pnpm add <package>` if a
`pnpm-lock.yaml` is present, `bun add <package>` for Bun, `cargo add <package>`
for Rust, and so on.

The lockfile lookup walks up from the target file's directory, so it works
inside monorepos and subpackages.

### Manual install (without the plugin system)

If you'd rather wire the hook up yourself, the script lives at
[`claude-code/package-manager-interceptor.mjs`](claude-code/package-manager-interceptor.mjs).
Drop it on disk and add the snippet from
[`claude-code/settings.example.json`](claude-code/settings.example.json) to your
`.claude/settings.json`.