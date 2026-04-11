import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Arch, OS, type WindowsVersion } from '../src/os_arch';

const mocks = vi.hoisted(() => ({
  coreInfo: vi.fn(),
  coreDebug: vi.fn(),
  downloadTool: vi.fn(),
  exec: vi.fn(),
  existsSync: vi.fn(),
  rmRF: vi.fn(),
  debugLog: vi.fn(),
  hasRootPrivileges: vi.fn(),
  getCudaLocalInstallerUrl: vi.fn(),
  findCudaRepoAndPackageLinux: vi.fn(),
  findCudaNetworkInstallerWindows: vi.fn(),
}));

vi.mock('@actions/core', () => ({
  info: mocks.coreInfo,
  debug: mocks.coreDebug,
}));

vi.mock('@actions/exec', () => ({
  exec: mocks.exec,
}));

vi.mock('@actions/tool-cache', () => ({
  downloadTool: mocks.downloadTool,
}));

vi.mock('@actions/io', () => ({
  rmRF: mocks.rmRF,
}));

vi.mock('../src/utils', () => ({
  debugLog: mocks.debugLog,
  hasRootPrivileges: mocks.hasRootPrivileges,
}));

vi.mock('../src/cuda', () => ({
  getCudaLocalInstallerUrl: mocks.getCudaLocalInstallerUrl,
  findCudaRepoAndPackageLinux: mocks.findCudaRepoAndPackageLinux,
  findCudaNetworkInstallerWindows: mocks.findCudaNetworkInstallerWindows,
}));

vi.mock('fs', () => ({
  existsSync: mocks.existsSync,
}));

import { installCudaLocal, installCudaNetwork } from '../src/install';

describe('Windows CUDA installer execution', () => {
  const windowsVersion: WindowsVersion = {
    name: 'Windows 11',
    release: '10.0.26100',
    build: 26100,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['RUNNER_TEMP'] = 'C:\\actions-runner\\_temp';
    mocks.existsSync.mockReturnValue(true);
    mocks.exec.mockResolvedValue(0);
    mocks.rmRF.mockResolvedValue(undefined);
    mocks.hasRootPrivileges.mockReturnValue(true);
    mocks.getCudaLocalInstallerUrl.mockResolvedValue('https://example.com/cuda-local.exe');
    mocks.findCudaNetworkInstallerWindows.mockResolvedValue('https://example.com/cuda-network.exe');
  });

  it('downloads the local installer into RUNNER_TEMP and executes it with quotes', async () => {
    mocks.downloadTool.mockResolvedValue('C:\\actions-runner\\_temp\\cuda_12.8.1_windows.exe');

    await installCudaLocal('12.8.1', OS.WINDOWS, Arch.X86_64);

    expect(mocks.downloadTool).toHaveBeenCalledWith(
      'https://example.com/cuda-local.exe',
      'C:\\actions-runner\\_temp\\cuda_12.8.1_windows.exe'
    );
    expect(mocks.exec).toHaveBeenCalledWith(
      '"C:\\actions-runner\\_temp\\cuda_12.8.1_windows.exe"',
      ['-s']
    );
  });

  it('quotes the network installer path when the path contains spaces', async () => {
    process.env['RUNNER_TEMP'] = 'C:\\Users\\Junya Morioka\\actions-runner\\_temp';
    mocks.downloadTool.mockResolvedValue(
      'C:\\Users\\Junya Morioka\\actions-runner\\_temp\\cuda_12.8.1_windows_network.exe'
    );

    const cudaPath = await installCudaNetwork('12.8.1', OS.WINDOWS, Arch.X86_64, windowsVersion);

    expect(mocks.downloadTool).toHaveBeenCalledWith(
      'https://example.com/cuda-network.exe',
      'C:\\Users\\Junya Morioka\\actions-runner\\_temp\\cuda_12.8.1_windows_network.exe'
    );
    expect(mocks.exec).toHaveBeenCalledWith(
      '"C:\\Users\\Junya Morioka\\actions-runner\\_temp\\cuda_12.8.1_windows_network.exe"',
      ['-s']
    );
    expect(cudaPath).toBe('C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8');
  });
});
