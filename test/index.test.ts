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
  exportVariable: vi.fn(),
  exec: vi.fn(),
  getExecOutput: vi.fn(),
  cp: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
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
  exportVariable: mocks.exportVariable,
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
  exec: mocks.exec,
  getExecOutput: mocks.getExecOutput,
}));

vi.mock('@actions/io', () => ({
  rmRF: vi.fn(),
  which: vi.fn(),
  cp: mocks.cp,
}));

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: mocks.existsSync,
  readdirSync: mocks.readdirSync,
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
const WINDOWS_TOOLKIT_DIR = 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v13.4';
const LINUX_TOOLKIT_DIR = '/usr/local/cuda-13.4';

function restoreOnlyToolkits(): void {
  mocks.restoreCache.mockImplementation(async (_paths: string[], key: string) =>
    key.startsWith('setup-cuda-toolkit-') ? key : undefined
  );
}

function execCommands(): string[] {
  return mocks.exec.mock.calls.map(([command]) => command);
}

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
  mocks.exec.mockResolvedValue(0);
  mocks.getExecOutput.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  mocks.cp.mockResolvedValue(undefined);
  // No installer exists before the restore; every other path exists
  mocks.existsSync.mockImplementation((p: string) => !/cuda_[\w.-]*\.(run|exe)$/.test(p));
  mocks.readdirSync.mockReturnValue([]);
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
      expect(mocks.exportVariable).toHaveBeenCalledWith('CUDA_PATH_V13_4', WINDOWS_TOOLKIT_DIR);
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

  it('fails before downloading when cache-toolkit is not a boolean', async () => {
    await runAction('auto', { 'cache-toolkit': 'yes' });

    expect(mocks.setFailed).toHaveBeenCalledWith(expect.stringContaining('cache-toolkit'));
    expect(mocks.downloadTool).not.toHaveBeenCalled();
  });

  it('saves the installed toolkit with cache-toolkit true and no cache entry', async () => {
    await runAction('network', { 'cache-toolkit': 'true' });

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.downloadTool).toHaveBeenCalledTimes(1);
    expect(mocks.saveCache).toHaveBeenCalledWith(
      [WINDOWS_TOOLKIT_DIR],
      'setup-cuda-toolkit-windows-x86_64-13.4.2-network'
    );
  });

  it('uses a cached toolkit instead of installing with cache-toolkit true', async () => {
    restoreOnlyToolkits();

    await runAction('network', { 'cache-installer': 'true', 'cache-toolkit': 'true' });

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.downloadTool).not.toHaveBeenCalled();
    expect(mocks.exec).not.toHaveBeenCalled();
    expect(mocks.saveCache).not.toHaveBeenCalled();
    expect(mocks.setOutput).toHaveBeenCalledWith('cuda-path', WINDOWS_TOOLKIT_DIR);
    expect(mocks.exportVariable).toHaveBeenCalledWith('CUDA_PATH_V13_4', WINDOWS_TOOLKIT_DIR);
  });

  it('succeeds with a cached toolkit when vswhere is absent', async () => {
    restoreOnlyToolkits();
    mocks.existsSync.mockImplementation((p: string) => !p.endsWith('vswhere.exe'));

    await runAction('network', { 'cache-toolkit': 'true' });

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.cp).not.toHaveBeenCalled();
    expect(mocks.setOutput).toHaveBeenCalledWith('cuda-path', WINDOWS_TOOLKIT_DIR);
  });

  it('saves no cache when the installer command fails', async () => {
    mocks.exec.mockRejectedValue(new Error('installer exited with 1'));

    await runAction('network', { 'cache-installer': 'true', 'cache-toolkit': 'true' });

    expect(mocks.setFailed).toHaveBeenCalled();
    expect(mocks.saveCache).not.toHaveBeenCalled();
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

  it('uses a cached toolkit instead of installing with cache-toolkit true', async () => {
    restoreOnlyToolkits();

    await runAction('local', { 'cache-installer': 'true', 'cache-toolkit': 'true' });

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(mocks.downloadTool).not.toHaveBeenCalled();
    expect(execCommands()).toEqual([
      expect.stringMatching(new RegExp(`mkdir -p ${LINUX_TOOLKIT_DIR}$`)),
      expect.stringMatching(new RegExp(`chown \\d+:\\d+ ${LINUX_TOOLKIT_DIR}$`)),
      expect.stringMatching(new RegExp(`ln -sfnT ${LINUX_TOOLKIT_DIR} /usr/local/cuda$`)),
    ]);
    expect(mocks.setOutput).toHaveBeenCalledWith('cuda-path', '/usr/local/cuda');
    expect(mocks.exportVariable).toHaveBeenCalledWith('CUDA_PATH', '/usr/local/cuda');
  });

  it('saves the installed toolkit without preparing its directory when no cache entry exists', async () => {
    await runAction('local', { 'cache-toolkit': 'true' });

    expect(mocks.setFailed).not.toHaveBeenCalled();
    expect(execCommands()).not.toContainEqual(expect.stringMatching(/mkdir|chown/));
    expect(mocks.saveCache).toHaveBeenCalledWith(
      [LINUX_TOOLKIT_DIR],
      'setup-cuda-toolkit-linux-x86_64-ubuntu-24.04-13.4.2-local'
    );
  });

  it('saves no cache when the runfile fails', async () => {
    mocks.exec.mockRejectedValue(new Error('runfile exited with 1'));

    await runAction('local', { 'cache-installer': 'true', 'cache-toolkit': 'true' });

    expect(mocks.setFailed).toHaveBeenCalled();
    expect(mocks.saveCache).not.toHaveBeenCalled();
  });
});
