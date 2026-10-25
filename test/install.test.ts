import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Arch, OS, type LinuxDistribution, type WindowsVersion } from '../src/os_arch';

const mocks = vi.hoisted(() => ({
  coreInfo: vi.fn(),
  coreDebug: vi.fn(),
  coreWarning: vi.fn(),
  restoreCache: vi.fn(),
  saveCache: vi.fn(),
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
  warning: mocks.coreWarning,
}));

vi.mock('@actions/cache', () => ({
  restoreCache: mocks.restoreCache,
  saveCache: mocks.saveCache,
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

vi.mock('../src/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/utils')>()),
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

    await installCudaLocal('12.8.1', OS.WINDOWS, Arch.X86_64, false);

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

    const cudaPath = await installCudaNetwork(
      '12.8.1',
      OS.WINDOWS,
      Arch.X86_64,
      windowsVersion,
      false
    );

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

describe('installer cache', () => {
  const BASE_URL = 'https://developer.download.nvidia.com/compute/cuda/13.4.2';
  const RUNNER_TEMP = 'C:\\actions-runner\\_temp';
  const ubuntu: LinuxDistribution = {
    id: 'ubuntu',
    version: '24.04',
    name: 'Ubuntu 24.04 LTS',
    idLink: 'debian',
  };
  const windowsVersion: WindowsVersion = {
    name: 'Windows Server 2022',
    release: '10.0.20348',
    build: 20348,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['RUNNER_TEMP'] = RUNNER_TEMP;
    // No installer exists before the restore; the toolkit directory check passes
    mocks.existsSync.mockImplementation((p: string) => !/cuda_[\w.-]*\.(run|exe)$/.test(p));
    mocks.exec.mockResolvedValue(0);
    mocks.rmRF.mockResolvedValue(undefined);
    mocks.hasRootPrivileges.mockReturnValue(true);
    mocks.restoreCache.mockResolvedValue(undefined);
    mocks.saveCache.mockResolvedValue(1);
    mocks.downloadTool.mockImplementation(async (_url: string, dest?: string) => dest ?? 'repo');
  });

  describe('Linux runfile', () => {
    const runfile = 'cuda_13.4.2_linux.run';
    const key = 'setup-cuda-installer-linux-x86_64-cuda_13.4.2_linux.run';

    beforeEach(() => {
      mocks.getCudaLocalInstallerUrl.mockResolvedValue(`${BASE_URL}/local_installers/${runfile}`);
    });

    it('downloads the runfile on a miss and saves it after installing and before removing it', async () => {
      await installCudaLocal('13.4.2', OS.LINUX, Arch.X86_64, true);

      expect(mocks.restoreCache).toHaveBeenCalledWith([runfile], key);
      expect(mocks.downloadTool).toHaveBeenCalledTimes(1);
      expect(mocks.downloadTool).toHaveBeenCalledWith(
        `${BASE_URL}/local_installers/${runfile}`,
        runfile
      );
      expect(mocks.saveCache).toHaveBeenCalledTimes(1);
      expect(mocks.saveCache).toHaveBeenCalledWith([runfile], key);

      const installOrder = mocks.exec.mock.invocationCallOrder[0];
      const saveOrder = mocks.saveCache.mock.invocationCallOrder[0];
      const removeOrder = Math.max(...mocks.rmRF.mock.invocationCallOrder);
      expect(mocks.exec.mock.calls[0][0]).toBe(`sh ${path.resolve(runfile)}`);
      expect(installOrder).toBeLessThan(saveOrder);
      expect(saveOrder).toBeLessThan(removeOrder);

      // A partial file from the missed restore is cleared before the download writes there
      expect(mocks.rmRF.mock.calls[0][0]).toBe(runfile);
      expect(mocks.rmRF.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.downloadTool.mock.invocationCallOrder[0]
      );
    });

    it('executes the restored runfile without downloading it on a hit', async () => {
      mocks.restoreCache.mockResolvedValue(key);

      await installCudaLocal('13.4.2', OS.LINUX, Arch.X86_64, true);

      expect(mocks.downloadTool).not.toHaveBeenCalled();
      expect(mocks.exec).toHaveBeenCalledWith(`sh ${path.resolve(runfile)}`, [
        '--silent',
        '--override',
        '--toolkit',
      ]);
      expect(mocks.saveCache).not.toHaveBeenCalled();
    });

    it('does not save the runfile when the installer command rejects', async () => {
      mocks.exec.mockRejectedValueOnce(new Error('installer failed'));

      await expect(installCudaLocal('13.4.2', OS.LINUX, Arch.X86_64, true)).rejects.toThrow(
        'installer failed'
      );

      expect(mocks.saveCache).not.toHaveBeenCalled();
    });
  });

  it('saves the Windows local installer from RUNNER_TEMP on a miss', async () => {
    mocks.getCudaLocalInstallerUrl.mockResolvedValue(
      `${BASE_URL}/local_installers/cuda_13.4.2_windows_x86_64.exe`
    );

    await installCudaLocal('13.4.2', OS.WINDOWS, Arch.X86_64, true);

    expect(mocks.downloadTool).toHaveBeenCalledTimes(1);
    expect(mocks.saveCache).toHaveBeenCalledWith(
      [`${RUNNER_TEMP}\\cuda_13.4.2_windows.exe`],
      'setup-cuda-installer-windows-x86_64-cuda_13.4.2_windows_x86_64.exe'
    );
  });

  describe('Windows network installer', () => {
    const installerPath = `${RUNNER_TEMP}\\cuda_13.4.2_windows_network.exe`;
    const key = 'setup-cuda-installer-windows-x86_64-cuda_13.4.2_windows_x86_64_network.exe';

    beforeEach(() => {
      mocks.findCudaNetworkInstallerWindows.mockResolvedValue(
        `${BASE_URL}/network_installers/cuda_13.4.2_windows_x86_64_network.exe`
      );
    });

    it('saves the network installer from RUNNER_TEMP on a miss', async () => {
      await installCudaNetwork('13.4.2', OS.WINDOWS, Arch.X86_64, windowsVersion, true);

      expect(mocks.downloadTool).toHaveBeenCalledTimes(1);
      expect(mocks.saveCache).toHaveBeenCalledWith([installerPath], key);
      expect(mocks.saveCache.mock.invocationCallOrder[0]).toBeLessThan(
        Math.max(...mocks.rmRF.mock.invocationCallOrder)
      );
    });

    it('executes the restored network installer without downloading it on a hit', async () => {
      mocks.restoreCache.mockResolvedValue(key);

      await installCudaNetwork('13.4.2', OS.WINDOWS, Arch.X86_64, windowsVersion, true);

      expect(mocks.restoreCache).toHaveBeenCalledWith([installerPath], key);
      expect(mocks.downloadTool).not.toHaveBeenCalled();
      expect(mocks.exec).toHaveBeenCalledWith(`"${installerPath}"`, ['-s']);
      expect(mocks.saveCache).not.toHaveBeenCalled();
    });

    it('fails without saving when the installer exits without creating the toolkit directory', async () => {
      mocks.existsSync.mockReturnValue(false);

      await expect(
        installCudaNetwork('13.4.2', OS.WINDOWS, Arch.X86_64, windowsVersion, true)
      ).rejects.toThrow('CUDA installation failed');

      expect(mocks.saveCache).not.toHaveBeenCalled();
    });
  });

  it('only logs that cache-installer has no effect for the Linux network installation', async () => {
    mocks.findCudaRepoAndPackageLinux.mockResolvedValue({
      repoUrl:
        'https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb',
      packageName: 'cuda-toolkit-13-4',
    });

    const cudaPath = await installCudaNetwork('13.4.2', OS.LINUX, Arch.X86_64, ubuntu, true);

    expect(cudaPath).toBe('/usr/local/cuda');
    const installerCacheKeys = [
      ...mocks.restoreCache.mock.calls.map((call) => call[1] as string),
      ...mocks.saveCache.mock.calls.map((call) => call[1] as string),
    ].filter((key) => key.startsWith('setup-cuda-installer-'));
    expect(installerCacheKeys).toEqual([]);
    expect(mocks.coreInfo).toHaveBeenCalledWith(expect.stringContaining('cache-installer'));
  });
});
