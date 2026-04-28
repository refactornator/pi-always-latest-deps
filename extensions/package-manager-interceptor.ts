import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { basename, dirname, join, isAbsolute } from "node:path";
import { existsSync } from "node:fs";

// Simple mapping for ecosystems with distinct dependency files
const STATIC_MANAGERS: Record<string, string> = {
  "requirements.txt": "pip install",
  "Gemfile": "bundle add",
  "Cargo.toml": "cargo add",
  "go.mod": "go get",
  "deno.json": "deno add",
  "deno.jsonc": "deno add",
};

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {

    // Intercept both write and edit operations
    if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      const targetPath = event.input.path;
      if (!targetPath) return;

      const fileName = basename(targetPath);
      let command = STATIC_MANAGERS[fileName];

      // Dynamic detection for JavaScript ecosystems using package.json
      if (fileName === "package.json") {
        // Resolve target directory to check lockfiles
        const targetDir = isAbsolute(targetPath) ? dirname(targetPath) : join(ctx.cwd, dirname(targetPath));
        
        if (existsSync(join(targetDir, "bun.lockb")) || existsSync(join(targetDir, "bun.lock"))) {
          command = "bun add";
        } else if (existsSync(join(targetDir, "pnpm-lock.yaml"))) {
          command = "pnpm add";
        } else if (existsSync(join(targetDir, "yarn.lock"))) {
          command = "yarn add";
        } else if (existsSync(join(targetDir, "deno.lock")) || existsSync(join(targetDir, "deno.json"))) {
          // If the project uses deno but has a package.json
          command = "deno add";
        } else {
          // Default to npm if no other lockfile is found
          command = "npm install";
        }
      }


      if (command) {
        // Log the interception for transparency
        const logMessage = `Intercepted direct modification to ${fileName}. Redirecting to use ${command}.`;
        ctx.ui.notify(logMessage, "warning");
        
        // Block the operation and instruct the agent to use the package manager

        return {
          block: true,
          reason: `Blocked by extension. Do not modify ${fileName} directly to manage dependencies. Please use the bash tool to run '${command} <package>' instead.`,
        };
      }
    }
  });
}
