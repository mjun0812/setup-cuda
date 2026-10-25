import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { OS } from '../src/os_arch';

const mocks = vi.hoisted(() => ({
  warning: vi.fn(),
}));

// Only the action's own core calls are observed; @actions/cache keeps its real dependencies.
vi.mock('@actions/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@actions/core')>()),
  info: vi.fn(),
  warning: mocks.warning,
}));

import { restoreInstaller, restoreToolkit, saveInstaller, saveToolkit } from '../src/cache';

// A version whose toolkit directory exists on no machine running these tests.
const ABSENT_VERSION = '0.0.0';
const CACHE_SERVICE_ENV = [
  'ACTIONS_CACHE_URL',
  'ACTIONS_RESULTS_URL',
  'ACTIONS_RUNTIME_TOKEN',
  'ACTIONS_CACHE_SERVICE_V2',
  'RUNNER_TEMP',
  'GITHUB_WORKSPACE',
];

// The library waits between its request retries, so the cases run concurrently.
describe.concurrent('the real cache library without a cache service', () => {
  let tempDir: string;
  let savedEnv: Record<string, string | undefined>;

  beforeAll(() => {
    savedEnv = Object.fromEntries(CACHE_SERVICE_ENV.map((name) => [name, process.env[name]]));
    for (const name of CACHE_SERVICE_ENV) {
      delete process.env[name];
    }
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-cuda-cache-'));
    process.env['RUNNER_TEMP'] = tempDir;
    process.env['GITHUB_WORKSPACE'] = tempDir;
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports an installer miss', async () => {
    const installerPath = path.join(tempDir, 'cuda_13.4.2_linux.run');

    await expect(
      restoreInstaller(installerPath, 'setup-cuda-installer-linux-x86_64-cuda_13.4.2_linux.run')
    ).resolves.toBe(false);
  });

  it.each([OS.LINUX, OS.WINDOWS])('reports a %s toolkit miss', async (osType) => {
    await expect(
      restoreToolkit(ABSENT_VERSION, osType, `setup-cuda-toolkit-${osType}-x86_64-0.0.0-network`)
    ).resolves.toBeUndefined();
  });

  it('resolves when saving an existing installer file', async () => {
    const installerPath = path.join(tempDir, 'cuda_13.4.2_linux.run');
    fs.writeFileSync(installerPath, 'installer');

    await expect(
      saveInstaller(installerPath, 'setup-cuda-installer-linux-x86_64-cuda_13.4.2_linux.run')
    ).resolves.toBeUndefined();
  });

  it('resolves with a warning when the toolkit directory does not exist', async () => {
    await expect(
      saveToolkit(ABSENT_VERSION, OS.LINUX, 'setup-cuda-toolkit-linux-x86_64-0.0.0-network')
    ).resolves.toBeUndefined();

    expect(mocks.warning).toHaveBeenCalledWith(
      expect.stringContaining('setup-cuda-toolkit-linux-x86_64-0.0.0-network')
    );
  });
});
