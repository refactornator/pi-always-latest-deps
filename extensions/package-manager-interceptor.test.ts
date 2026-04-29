import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";

import packageManagerInterceptor from "./package-manager-interceptor";

type MockPi = ExtensionAPI & {
  emit: (event: string, payload: unknown, ctx: unknown) => Promise<unknown>;
};

const createMockPi = (): MockPi => {
  const listeners: Record<string, Array<(payload: unknown, ctx: unknown) => Promise<unknown>>> = {};

  return {
    on: vi.fn((event, listener) => {
      listeners[event] ??= [];
      listeners[event].push(listener);
    }),
    emit: async (event: string, payload: unknown, ctx: unknown) => {
      for (const listener of listeners[event] ?? []) {
        const result = await listener(payload, ctx);

        if (result) {
          return result;
        }
      }

      return undefined;
    },
  } as unknown as MockPi;
};

const createMockCtx = (cwd = "/project") => ({
  cwd,
  ui: {
    notify: vi.fn(),
  },
});

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

describe("packageManagerInterceptor", () => {
  let mockPi: MockPi;
  let mockCtx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    mockPi = createMockPi();
    mockCtx = createMockCtx();
    packageManagerInterceptor(mockPi);
    vi.mocked(existsSync).mockReset();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it("blocks package.json writes with the shared npm guidance", async () => {
    const result = await mockPi.emit(
      "tool_call",
      {
        toolName: "write",
        input: {
          path: "package.json",
          content: {},
        },
      },
      mockCtx,
    );

    expect(result).toEqual({
      block: true,
      reason:
        "Blocked by extension. Do not modify package.json directly to manage dependencies. Please use the bash tool to run 'npm install <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to package.json. Redirecting to use npm install.",
      "warning",
    );
  });

  it("uses shared lockfile detection for package.json edits", async () => {
    vi.mocked(existsSync).mockImplementation(
      (path) => typeof path === "string" && path.endsWith("pnpm-lock.yaml"),
    );

    const result = await mockPi.emit(
      "tool_call",
      {
        toolName: "edit",
        input: {
          path: "/repo/app/package.json",
          content: {},
        },
      },
      mockCtx,
    );

    expect(result).toEqual({
      block: true,
      reason:
        "Blocked by extension. Do not modify package.json directly to manage dependencies. Please use the bash tool to run 'pnpm add <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to package.json. Redirecting to use pnpm add.",
      "warning",
    );
  });

  it("ignores non-manifest files", async () => {
    const result = await mockPi.emit(
      "tool_call",
      {
        toolName: "write",
        input: {
          path: "README.md",
          content: {},
        },
      },
      mockCtx,
    );

    expect(result).toBeUndefined();
    expect(mockCtx.ui.notify).not.toHaveBeenCalled();
  });
});
