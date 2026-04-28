import { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { basename, dirname, join, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import packageManagerInterceptor from "./package-manager-interceptor";

type MockPi = ExtensionAPI & {
  emit: (event: string, payload: any, ctx: any) => Promise<any>;
};

// Mock the Pi ExtensionAPI and its context
const createMockPi = (): MockPi => {
  const listeners: Record<string, Function[]> = {};
  return {
    on: vi.fn((event, listener) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(listener);
    }),
    emit: async (event: string, payload: any, ctx: any) => {
      if (listeners[event]) {
        for (const listener of listeners[event]) {
          const result = await listener(payload, ctx);
          if (result && result.block) {
            return result; // Return early if blocked
          }
        }
      }
      return undefined; // No block
    },
    // Add other methods if the extension were to use them, or mock them as vi.fn()
  } as unknown as MockPi;
};

const createMockCtx = (cwd: string = "/project") => ({
  cwd,
  ui: {
    notify: vi.fn(),
  },
  // Add other ctx properties if needed
});

// Mock node:path and node:fs
vi.mock('node:path', () => ({
  basename: vi.fn(path => (path.includes('/') ? path.split('/').pop() : path)),
  dirname: vi.fn(path => path.split('/').slice(0, -1).join('/')),
  join: vi.fn((...paths) => paths.join('/')),
  isAbsolute: vi.fn(path => path.startsWith('/')),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false), // Default to not existing
}));

describe('packageManagerInterceptor', () => {
  let mockPi: ReturnType<typeof createMockPi>;
  let mockCtx: ReturnType<typeof createMockCtx>;
  beforeEach(() => {
    mockPi = createMockPi();
    mockCtx = createMockCtx();
    packageManagerInterceptor(mockPi); // Register the extension

    mockCtx.ui.notify.mockClear();
    // Ensure all mocks related to node:path are cleared/reset
    vi.mocked(basename).mockClear();
    vi.mocked(dirname).mockClear();
    vi.mocked(join).mockClear();
    vi.mocked(isAbsolute).mockClear();
    // Ensure all mocks related to node:fs are cleared/reset
    vi.mocked(existsSync).mockClear();
    vi.mocked(existsSync).mockReturnValue(false); // Reset existsSync default
  });

  // Helper to simulate a tool_call event
  const simulateToolCall = async (toolName: 'write' | 'edit', path: string, content: any = {}) => {
    const event = {
      toolName,
      input: { path, content },
    };
    return mockPi.emit('tool_call', event, mockCtx);
  };

  // --- Test Cases for package.json ---

  it('should intercept package.json write and recommend npm install if no lockfile', async () => {
    const result = await simulateToolCall('write', 'package.json');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify package.json directly to manage dependencies. Please use the bash tool to run 'npm install <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to package.json. Redirecting to use npm install.",
      "warning"
    );
  });

  it('should intercept package.json edit and recommend bun add if bun.lockb exists', async () => {
    (existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      return path.endsWith('bun.lockb');
    });
    const result = await simulateToolCall('edit', 'project/package.json');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify package.json directly to manage dependencies. Please use the bash tool to run 'bun add <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to package.json. Redirecting to use bun add.",
      "warning"
    );
  });

  it('should intercept package.json edit and recommend pnpm add if pnpm-lock.yaml exists', async () => {
    (existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      return path.endsWith('pnpm-lock.yaml');
    });
    const result = await simulateToolCall('edit', 'sub/dir/package.json');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify package.json directly to manage dependencies. Please use the bash tool to run 'pnpm add <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to package.json. Redirecting to use pnpm add.",
      "warning"
    );
  });

  it('should intercept package.json write and recommend yarn add if yarn.lock exists', async () => {
    (existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      return path.endsWith('yarn.lock');
    });
    const result = await simulateToolCall('write', '/root/app/package.json');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify package.json directly to manage dependencies. Please use the bash tool to run 'yarn add <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to package.json. Redirecting to use yarn add.",
      "warning"
    );
  });

  it('should intercept package.json write and recommend deno add if deno.lock exists', async () => {
    (existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      return path.endsWith('deno.lock');
    });
    const result = await simulateToolCall('write', '/root/app/package.json');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify package.json directly to manage dependencies. Please use the bash tool to run 'deno add <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to package.json. Redirecting to use deno add.",
      "warning"
    );
  });

  it('should intercept package.json write and recommend deno add if deno.json exists', async () => {
    (existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      return path.endsWith('deno.json');
    });
    const result = await simulateToolCall('write', '/root/app/package.json');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify package.json directly to manage dependencies. Please use the bash tool to run 'deno add <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to package.json. Redirecting to use deno add.",
      "warning"
    );
  });

  // --- Test Cases for static managers ---

  it('should intercept requirements.txt write and recommend pip install', async () => {
    const result = await simulateToolCall('write', 'requirements.txt');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify requirements.txt directly to manage dependencies. Please use the bash tool to run 'pip install <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to requirements.txt. Redirecting to use pip install.",
      "warning"
    );
  });

  it('should intercept Gemfile edit and recommend bundle add', async () => {
    const result = await simulateToolCall('edit', 'Gemfile');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify Gemfile directly to manage dependencies. Please use the bash tool to run 'bundle add <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to Gemfile. Redirecting to use bundle add.",
      "warning"
    );
  });

  it('should intercept Cargo.toml write and recommend cargo add', async () => {
    const result = await simulateToolCall('write', 'Cargo.toml');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify Cargo.toml directly to manage dependencies. Please use the bash tool to run 'cargo add <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to Cargo.toml. Redirecting to use cargo add.",
      "warning"
    );
  });

  it('should intercept go.mod write and recommend go get', async () => {
    const result = await simulateToolCall('write', 'go.mod');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify go.mod directly to manage dependencies. Please use the bash tool to run 'go get <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to go.mod. Redirecting to use go get.",
      "warning"
    );
  });

  it('should intercept deno.json write and recommend deno add', async () => {
    const result = await simulateToolCall('write', 'deno.json');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify deno.json directly to manage dependencies. Please use the bash tool to run 'deno add <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to deno.json. Redirecting to use deno add.",
      "warning"
    );
  });

  it('should intercept deno.jsonc write and recommend deno add', async () => {
    const result = await simulateToolCall('write', 'deno.jsonc');
    expect(result).toEqual({
      block: true,
      reason: "Blocked by extension. Do not modify deno.jsonc directly to manage dependencies. Please use the bash tool to run 'deno add <package>' instead.",
    });
    expect(mockCtx.ui.notify).toHaveBeenCalledWith(
      "Intercepted direct modification to deno.jsonc. Redirecting to use deno add.",
      "warning"
    );
  });

  // --- Test Cases for no interception ---

  it('should not intercept write operations on non-manager files', async () => {
    const result = await simulateToolCall('write', 'src/main.ts');
    expect(result).toBeUndefined();
    expect(mockCtx.ui.notify).not.toHaveBeenCalled();
  });

  it('should not intercept edit operations on non-manager files', async () => {
    const result = await simulateToolCall('edit', 'README.md');
    expect(result).toBeUndefined();
    expect(mockCtx.ui.notify).not.toHaveBeenCalled();
  });

  it('should not intercept if targetPath is undefined', async () => {
    const event = {
      toolName: "write",
      input: { content: {} }, // No path
    };
    // Call mockPi.emit directly, as simulateToolCall expects a path
    const result = await mockPi.emit('tool_call', event, mockCtx);
    expect(result).toBeUndefined();
    expect(mockCtx.ui.notify).not.toHaveBeenCalled();
  });
});
