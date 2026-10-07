import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Arch } from '../src/os_arch';

const mocks = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  arch: '' as string,
  manifest: '',
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  downloadTool: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@actions/core', () => ({
  getInput: (name: string) => mocks.inputs[name] ?? '',
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
    getOS: () => actual.OS.WINDOWS,
    getArch: () => mocks.arch,
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

async function runAction(method: string): Promise<void> {
  mocks.inputs = { version: '13.4', method };
  vi.resetModules();
  await import('../src/index');
  await vi.waitFor(() => {
    expect(mocks.setOutput.mock.calls.length + mocks.setFailed.mock.calls.length).toBeGreaterThan(
      0
    );
  });
}

describe('CUDA 13.4.2 setup on Windows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.arch = Arch.X86_64;
    mocks.get.mockImplementation(async () => ({
      message: { statusCode: 200 },
      readBody: async () => mocks.manifest,
    }));
    mocks.manifest = MANIFEST_13_4_2;
    mocks.downloadTool.mockImplementation(async (_url: string, dest: string) => dest);
  });

  it.each([
    ['local', `${BASE_URL}/local_installers/cuda_13.4.2_windows_x86_64.exe`],
    ['network', `${BASE_URL}/network_installers/cuda_13.4.2_windows_x86_64_network.exe`],
    ['auto', `${BASE_URL}/network_installers/cuda_13.4.2_windows_x86_64_network.exe`],
  ])('downloads the x86_64 installer with method %s', async (method, installerUrl) => {
    await runAction(method);

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.downloadTool).toHaveBeenCalledTimes(1);
    expect(mocks.downloadTool.mock.calls[0][0]).toBe(installerUrl);
    expect(mocks.setOutput).toHaveBeenCalledWith('version', '13.4.2');
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
