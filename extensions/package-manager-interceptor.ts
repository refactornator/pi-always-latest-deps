import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import {
  evaluateDependencyManifestEdit,
  formatInterceptionNotification,
  formatPiBlockReason,
} from "../shared/dependency-policy.mjs";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      const decision = evaluateDependencyManifestEdit(
        {
          cwd: ctx.cwd,
          targetPath: event.input.path,
        },
        {
          existsSync,
        },
      );

      if (decision) {
        ctx.ui.notify(formatInterceptionNotification(decision), "warning");
        return {
          block: true,
          reason: formatPiBlockReason(decision),
        };
      }
    }
  });
}
