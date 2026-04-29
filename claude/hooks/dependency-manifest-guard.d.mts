import type { DependencyManifestDecision, DependencyPolicyDependencies } from "../../shared/dependency-policy.mjs";

export interface ClaudeHookPayload {
  cwd?: string;
  file_path?: string | null;
  tool_input?: {
    file_path?: string | null;
    path?: string | null;
  } | null;
}

export interface ClaudeHookDecision {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "deny";
    permissionDecisionReason: string;
  };
}

export function buildClaudeHookDecision(
  payload: ClaudeHookPayload,
  deps?: DependencyPolicyDependencies & { cwd?: string },
): ClaudeHookDecision | null;

export function readJsonFromStdin(stdin?: AsyncIterable<string | Buffer>): Promise<unknown>;

export function main(input?: {
  stdin?: AsyncIterable<string | Buffer>;
  stdout?: { write(chunk: string): unknown };
  stderr?: { write(chunk: string): unknown };
  cwd?: string;
}): Promise<number>;
