export interface PathApi {
  basename(path: string): string;
  dirname(path: string): string;
  isAbsolute(path: string): boolean;
  join(...paths: string[]): string;
}

export interface SupportedManifestPolicy {
  fileName: string;
  strategy: "auto-detect" | "static";
  command?: string;
  commands?: string[];
  defaultCommand?: string;
  note?: string;
}

export interface DependencyManifestDecision {
  fileName: string;
  command: string;
  targetDir: string;
}

export interface DependencyManifestEvaluationInput {
  cwd: string;
  targetPath?: string | null;
}

export interface DependencyPolicyDependencies {
  existsSync?: (path: string) => boolean;
  pathApi?: PathApi;
}

export const STATIC_MANAGERS: Readonly<Record<string, string>>;
export const PACKAGE_JSON_DEFAULT_COMMAND: string;
export const PACKAGE_JSON_LOCKFILE_RULES: ReadonlyArray<{
  readonly command: string;
  readonly evidenceFiles: readonly string[];
}>;
export const DEPENDENCY_WORKFLOW_PRINCIPLES: readonly string[];

export function getSupportedManifestPolicies(): SupportedManifestPolicy[];
export function resolveTargetDirectory(
  input: DependencyManifestEvaluationInput & { targetPath: string },
  deps?: Pick<DependencyPolicyDependencies, "pathApi">,
): string;
export function resolvePackageJsonCommand(
  targetDir: string,
  deps?: DependencyPolicyDependencies,
): string;
export function resolveDependencyCommand(
  input: Pick<DependencyManifestDecision, "fileName" | "targetDir">,
  deps?: DependencyPolicyDependencies,
): string | undefined;
export function evaluateDependencyManifestEdit(
  input: DependencyManifestEvaluationInput,
  deps?: DependencyPolicyDependencies,
): DependencyManifestDecision | null;
export function formatInterceptionNotification(decision: DependencyManifestDecision): string;
export function formatPiBlockReason(decision: DependencyManifestDecision): string;
export function formatClaudeDenyReason(decision: DependencyManifestDecision): string;
export function renderSupportedManifestSummary(): string;
export function renderWorkflowPrinciples(): string;
