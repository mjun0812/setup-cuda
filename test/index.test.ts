import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Arch, OS } from '../src/os_arch';

const mocks = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  os: '' as string,
  arch: '' as string,
  manifest: '',
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  downloadTool: vi.fn(),
  get: vi.fn(),
  restoreCache: vi.fn(),
  saveCache: vi.fn(),
}));

// An omitted input reads as its action.yml default, which is 'false' for every boolean input.
function getBooleanInput(name: string): boolean {
  const value = mocks.inputs[name] ?? 'false';
  if (['true', 'True', 'TRUE'].includes(value)) {
    return true;
  }
  if (['false', 'False', 'FALSE'].includes(value)) {
    return false;
  }
  throw new TypeError(`Input does not meet YAML 1.2 "Core Schema" specification: ${name}`);
}

vi.mock('@actions/core', () => ({
  getInput: (name: string) => mocks.inputs[name] ?? '',
  getBooleanInput,
  warning: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setFailed: mocks.setFailed,
  setOutput: mocks.setOutput,
  addPath: vi.fn(),
  exportVariable: vi.fn(),
}));

vi.mock('@actions/http-client', () => ({
  HttpClient: class {
    get = mocks.get;
  },
}));

vi.mock('@actions/cache', () => ({
  restoreCache: mocks.restoreCache,
  saveCache: mocks.saveCache,
}));

vi.mock('@actions/tool-cache', () => ({
  downloadTool: mocks.downloadTool,
}));

vi.mock('@actions/exec', () => ({
  exec: vi.fn().mockResolvedValue(0),
}));

vi.mock('@actions/io', () => ({
  rmRF: vi.fn(),
  which: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: () => true,
}));

vi.mock('../src/os_arch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/os_arch')>();
  return {
    ...actual,
    getOS: () => mocks.os,
    getArch: () => mocks.arch,
    getLinuxDistribution: () => ({
      id: 'ubuntu',
      version: '24.04',
      name: 'Ubuntu 24.04 LTS',
      idLink: 'debian',
    }),
    getWindowsVersion: () => ({ name: 'Windows Server 2022', release: '10.0.20348', build: 20348 }),
  };
});

vi.mock('../src/cuda', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/cuda')>()),
  findCudaVersion: async () => '13.4.2',
}));

// https://developer.download.nvidia.com/compute/cuda/13.4.2/docs/sidebar/md5sum.txt
const MANIFEST_13_4_2 = readFileSync(
  new URL('./fixtures/md5sum_13.4.2.txt', import.meta.url),
  'utf-8'
);
const BASE_URL = 'https://developer.download.nvidia.com/compute/cuda/13.4.2';

async function runAction(method: string, inputs: Record<string, string> = {}): Promise<void> {
  mocks.inputs = { version: '13.4', method, ...inputs };
  vi.resetModules();
  await import('../src/index');
  await vi.waitFor(() => {
    expect(mocks.setOutput.mock.calls.length + mocks.setFailed.mock.calls.length).toBeGreaterThan(
      0
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.os = OS.WINDOWS;
  mocks.arch = Arch.X86_64;
  mocks.get.mockImplementation(async () => ({
    message: { statusCode: 200 },
    readBody: async () => mocks.manifest,
  }));
  mocks.manifest = MANIFEST_13_4_2;
  mocks.downloadTool.mockImplementation(async (_url: string, dest: string) => dest);
  mocks.restoreCache.mockResolvedValue(undefined);
  mocks.saveCache.mockResolvedValue(1);
});

describe('CUDA 13.4.2 setup on Windows', () => {
  it.each([
    ['local', `${BASE_URL}/local_installers/cuda_13.4.2_windows_x86_64.exe`],
    ['network', `${BASE_URL}/network_installers/cuda_13.4.2_windows_x86_64_network.exe`],
    ['auto', `${BASE_URL}/network_installers/cuda_13.4.2_windows_x86_64_network.exe`],
  ])(
    'downloads the x86_64 installer with method %s without touching the cache',
    async (method, installerUrl) => {
      await runAction(method, { 'cache-installer': 'false', 'cache-toolkit': 'false' });

      expect(mocks.setFailed).not.toHaveBeenCalled();
      expect(mocks.downloadTool).toHaveBeenCalledTimes(1);
      expect(mocks.downloadTool.mock.calls[0][0]).toBe(installerUrl);
      expect(mocks.setOutput).toHaveBeenCalledWith('version', '13.4.2');
      expect(mocks.restoreCache).not.toHaveBeenCalled();
      expect(mocks.saveCache).not.toHaveBeenCalled();
    }
  );

  it('restores and saves the installer with cache-installer true', async () => {
    await runAction('network', { 'cache-installer': 'true' });

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.restoreCache).toHaveBeenCalledTimes(1);
    expect(mocks.saveCache).toHaveBeenCalledWith(
      [expect.stringContaining('cuda_13.4.2_windows_network.exe')],
      'setup-cuda-installer-windows-x86_64-cuda_13.4.2_windows_x86_64_network.exe'
    );
  });

  it('fails before downloading when cache-installer is not a boolean', async () => {
    await runAction('auto', { 'cache-installer': 'yes' });

    expect(mocks.setFailed).toHaveBeenCalledWith(expect.stringContaining('cache-installer'));
    expect(mocks.downloadTool).not.toHaveBeenCalled();
  });

  it('falls back to the local installer with method auto when no network installer exists', async () => {
    mocks.manifest = MANIFEST_13_4_2.split('\n')
      .filter((line) => !line.endsWith('_network.exe'))
      .join('\n');

    await runAction('auto');

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.downloadTool).toHaveBeenCalledTimes(1);
    expect(mocks.downloadTool.mock.calls[0][0]).toBe(
      `${BASE_URL}/local_installers/cuda_13.4.2_windows_x86_64.exe`
    );
  });

  it('rejects Windows ARM64', async () => {
    mocks.arch = Arch.ARM64_SBSA;

    await runAction('auto');

    expect(mocks.setFailed).toHaveBeenCalledWith(
      'CUDA is not supported on Windows with Arm architecture'
    );
    expect(mocks.downloadTool).not.toHaveBeenCalled();
  });
});

describe('CUDA 13.4.2 setup on Linux', () => {
  beforeEach(() => {
    mocks.os = OS.LINUX;
  });

  it('downloads the runfile once without touching the cache', async () => {
    await runAction('local', { 'cache-installer': 'false', 'cache-toolkit': 'false' });

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.downloadTool).toHaveBeenCalledTimes(1);
    expect(mocks.downloadTool.mock.calls[0][0]).toBe(
      `${BASE_URL}/local_installers/cuda_13.4.2_linux.run`
    );
    expect(mocks.restoreCache).not.toHaveBeenCalled();
    expect(mocks.saveCache).not.toHaveBeenCalled();
  });

  it('restores and saves the runfile with cache-installer true', async () => {
    await runAction('local', { 'cache-installer': 'true' });

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.restoreCache).toHaveBeenCalledTimes(1);
    expect(mocks.saveCache).toHaveBeenCalledWith(
      ['cuda_13.4.2_linux.run'],
      'setup-cuda-installer-linux-x86_64-cuda_13.4.2_linux.run'
    );
  });
});
