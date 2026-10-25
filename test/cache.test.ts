// tsconfig.json covers only src/, so this file loads Node's types itself when checked alone
/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Arch, OS } from '../src/os_arch';

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  restoreCache: vi.fn(),
  saveCache: vi.fn(),
  exec: vi.fn(),
  getExecOutput: vi.fn(),
  cp: vi.fn(),
  rmRF: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  hasRootPrivileges: vi.fn(),
}));

vi.mock('@actions/core', () => ({
  info: mocks.info,
  warning: mocks.warning,
  debug: vi.fn(),
}));

vi.mock('@actions/cache', () => ({
  restoreCache: mocks.restoreCache,
  saveCache: mocks.saveCache,
}));

vi.mock('@actions/exec', () => ({
  exec: mocks.exec,
  getExecOutput: mocks.getExecOutput,
}));

vi.mock('@actions/io', () => ({
  cp: mocks.cp,
  rmRF: mocks.rmRF,
}));

vi.mock('fs', () => ({
  existsSync: mocks.existsSync,
  readdirSync: mocks.readdirSync,
}));

vi.mock('../src/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/utils')>()),
  hasRootPrivileges: mocks.hasRootPrivileges,
}));

import {
  getToolkitCacheKey,
  getToolkitDir,
  restoreInstaller,
  restoreToolkit,
  saveInstaller,
  saveToolkit,
} from '../src/cache';

const LINUX_TOOLKIT_DIR = '/usr/local/cuda-13.4';
const WINDOWS_TOOLKIT_DIR = 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v13.4';
const KEY = 'setup-cuda-toolkit-test-key';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exec.mockResolvedValue(0);
  mocks.cp.mockResolvedValue(undefined);
  mocks.hasRootPrivileges.mockReturnValue(false);
});

describe('toolkit cache keys and directories', () => {
  it('builds the Linux key from the architecture, distribution, version and method', () => {
    const key = getToolkitCacheKey('13.4.2', OS.LINUX, Arch.ARM64_SBSA, 'network', {
      id: 'ubuntu',
      version: '24.04',
      name: 'Ubuntu 24.04 LTS',
      idLink: 'debian',
    });

    expect(key).toBe('setup-cuda-toolkit-linux-arm64-sbsa-ubuntu-24.04-13.4.2-network');
  });

  it('builds the Windows key from the architecture, version and method', () => {
    const key = getToolkitCacheKey('13.4.2', OS.WINDOWS, Arch.X86_64, 'auto', {
      name: 'Windows Server 2022',
      release: '10.0.20348',
      build: 20348,
    });

    expect(key).toBe('setup-cuda-toolkit-windows-x86_64-13.4.2-auto');
  });

  it.each([
    [OS.LINUX, LINUX_TOOLKIT_DIR],
    [OS.WINDOWS, WINDOWS_TOOLKIT_DIR],
  ])('uses the versioned toolkit directory on %s', (os, dir) => {
    expect(getToolkitDir('13.4.2', os)).toBe(dir);
  });
});

describe('installer restore', () => {
  const installer = 'cuda_13.4.2_linux.run';

  it('removes what a failed restore left at the installer path on a miss', async () => {
    mocks.existsSync.mockReturnValue(false);
    mocks.restoreCache.mockResolvedValue(undefined);

    await expect(restoreInstaller(installer, KEY)).resolves.toBe(false);

    expect(mocks.rmRF).toHaveBeenCalledWith(installer);
  });

  it.each([
    ['a hit', KEY],
    ['a miss', undefined],
  ])(
    'leaves a file already at the installer path untouched and skips the restore on %s',
    async (_, hit) => {
      mocks.existsSync.mockReturnValue(true);
      mocks.restoreCache.mockResolvedValue(hit);

      await expect(restoreInstaller(installer, KEY)).resolves.toBe(false);

      expect(mocks.restoreCache).not.toHaveBeenCalled();
      expect(mocks.rmRF).not.toHaveBeenCalled();
    }
  );

  it('keeps the restored installer on a hit', async () => {
    mocks.existsSync.mockReturnValue(false);
    mocks.restoreCache.mockResolvedValue(KEY);

    await expect(restoreInstaller(installer, KEY)).resolves.toBe(true);

    expect(mocks.rmRF).not.toHaveBeenCalled();
  });
});

describe('Linux toolkit restore', () => {
  beforeEach(() => {
    vi.spyOn(process, 'getuid').mockReturnValue(1001);
    vi.spyOn(process, 'getgid').mockReturnValue(118);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates nothing and reports a miss when no entry exists', async () => {
    mocks.restoreCache.mockResolvedValue(undefined);

    await expect(restoreToolkit('13.4.2', OS.LINUX, KEY)).resolves.toBeUndefined();

    expect(mocks.restoreCache).toHaveBeenCalledTimes(1);
    expect(mocks.restoreCache).toHaveBeenCalledWith([LINUX_TOOLKIT_DIR], KEY, [], {
      lookupOnly: true,
    });
    expect(mocks.exec).not.toHaveBeenCalled();
  });

  it('hands the toolkit directory to the user with sudo before restoring and links /usr/local/cuda', async () => {
    const events: string[] = [];
    mocks.exec.mockImplementation(async (command: string) => {
      events.push(command);
      return 0;
    });
    mocks.restoreCache.mockImplementation(async (_paths: string[], key: string, ...rest) => {
      events.push(rest.length > 0 ? 'lookup' : 'restore');
      return key;
    });

    await expect(restoreToolkit('13.4.2', OS.LINUX, KEY)).resolves.toBe('/usr/local/cuda');

    expect(events).toEqual([
      'lookup',
      `sudo mkdir -p ${LINUX_TOOLKIT_DIR}`,
      `sudo chown 1001:118 ${LINUX_TOOLKIT_DIR}`,
      'restore',
      `sudo ln -sfnT ${LINUX_TOOLKIT_DIR} /usr/local/cuda`,
    ]);
    expect(mocks.restoreCache).toHaveBeenLastCalledWith([LINUX_TOOLKIT_DIR], KEY);
  });

  it('runs the directory commands without sudo as root', async () => {
    mocks.hasRootPrivileges.mockReturnValue(true);
    mocks.restoreCache.mockImplementation(async (_paths: string[], key: string) => key);

    await restoreToolkit('13.4.2', OS.LINUX, KEY);

    expect(mocks.exec.mock.calls.map(([command]) => command)).toEqual([
      `mkdir -p ${LINUX_TOOLKIT_DIR}`,
      `chown 1001:118 ${LINUX_TOOLKIT_DIR}`,
      `ln -sfnT ${LINUX_TOOLKIT_DIR} /usr/local/cuda`,
    ]);
  });

  it('reports a miss without linking when the restore itself misses', async () => {
    mocks.restoreCache.mockResolvedValueOnce(KEY).mockResolvedValueOnce(undefined);

    await expect(restoreToolkit('13.4.2', OS.LINUX, KEY)).resolves.toBeUndefined();

    expect(mocks.exec.mock.calls.map(([command]) => command)).not.toContainEqual(
      expect.stringContaining('ln -sfn')
    );
  });
});

describe('Windows toolkit restore', () => {
  const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';
  const extensionsDir = `${WINDOWS_TOOLKIT_DIR}\\extras\\visual_studio_integration\\MSBuildExtensions`;
  const enterprise = 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise';
  const buildTools = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools';
  const existing = new Set<string>();
  const directories = new Map<string, string[]>();

  beforeEach(() => {
    vi.stubEnv('ProgramFiles(x86)', 'C:\\Program Files (x86)');
    existing.clear();
    directories.clear();
    existing.add(vswhere);
    directories.set(extensionsDir, ['CUDA 13.4.props', 'CUDA 13.4.targets']);
    for (const installation of [enterprise, buildTools]) {
      const vcDir = `${installation}\\MSBuild\\Microsoft\\VC`;
      existing.add(vcDir);
      directories.set(vcDir, ['v160', 'v170']);
      existing.add(`${vcDir}\\v160\\BuildCustomizations`);
      existing.add(`${vcDir}\\v170\\BuildCustomizations`);
    }
    mocks.existsSync.mockImplementation((p: string) => existing.has(p));
    mocks.readdirSync.mockImplementation((p: string) => directories.get(p) ?? []);
    mocks.getExecOutput.mockResolvedValue({
      exitCode: 0,
      stdout: `${enterprise}\r\n${buildTools}\r\n`,
      stderr: '',
    });
    mocks.restoreCache.mockImplementation(async (_paths: string[], key: string) => key);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('copies every MSBuild extension into every BuildCustomizations directory', async () => {
    await expect(restoreToolkit('13.4.2', OS.WINDOWS, KEY)).resolves.toBe(WINDOWS_TOOLKIT_DIR);

    expect(mocks.restoreCache).toHaveBeenCalledWith([WINDOWS_TOOLKIT_DIR], KEY);
    expect(mocks.getExecOutput).toHaveBeenCalledWith(`"${vswhere}"`, [
      '-products',
      '*',
      '-property',
      'installationPath',
    ]);
    const expectedCopies = [enterprise, buildTools].flatMap((installation) =>
      ['v160', 'v170'].flatMap((toolset) =>
        ['CUDA 13.4.props', 'CUDA 13.4.targets'].map((file) => [
          `${extensionsDir}\\${file}`,
          `${installation}\\MSBuild\\Microsoft\\VC\\${toolset}\\BuildCustomizations\\${file}`,
        ])
      )
    );
    expect(mocks.cp.mock.calls).toHaveLength(expectedCopies.length);
    expect(mocks.cp.mock.calls).toEqual(expect.arrayContaining(expectedCopies));
  });

  it('copies into the BuildCustomizations directory of Visual Studio 2017', async () => {
    // Visual Studio 2017 keeps its VC targets under Common7 instead of MSBuild\Microsoft\VC
    const vs2017 = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\Enterprise';
    const vs2017Dir = `${vs2017}\\Common7\\IDE\\VC\\VCTargets\\BuildCustomizations`;
    existing.add(vs2017Dir);
    mocks.getExecOutput.mockResolvedValue({ exitCode: 0, stdout: `${vs2017}\r\n`, stderr: '' });

    await restoreToolkit('13.4.2', OS.WINDOWS, KEY);

    expect(mocks.cp.mock.calls).toEqual([
      [`${extensionsDir}\\CUDA 13.4.props`, `${vs2017Dir}\\CUDA 13.4.props`],
      [`${extensionsDir}\\CUDA 13.4.targets`, `${vs2017Dir}\\CUDA 13.4.targets`],
    ]);
  });

  it('skips installations without the C++ build tools', async () => {
    existing.delete(`${buildTools}\\MSBuild\\Microsoft\\VC`);

    await restoreToolkit('13.4.2', OS.WINDOWS, KEY);

    expect(mocks.cp.mock.calls.map(([, dest]) => dest)).not.toContainEqual(
      expect.stringContaining(buildTools)
    );
    expect(mocks.cp).toHaveBeenCalledTimes(4);
  });

  it('restores the toolkit and copies nothing when vswhere is absent', async () => {
    existing.delete(vswhere);

    await expect(restoreToolkit('13.4.2', OS.WINDOWS, KEY)).resolves.toBe(WINDOWS_TOOLKIT_DIR);

    expect(mocks.getExecOutput).not.toHaveBeenCalled();
    expect(mocks.cp).not.toHaveBeenCalled();
  });

  it('copies nothing on a miss', async () => {
    mocks.restoreCache.mockResolvedValue(undefined);

    await expect(restoreToolkit('13.4.2', OS.WINDOWS, KEY)).resolves.toBeUndefined();

    expect(mocks.cp).not.toHaveBeenCalled();
  });
});

describe('cache saves', () => {
  it.each([
    ['saveInstaller', () => saveInstaller('cuda_13.4.2_linux.run', KEY)],
    ['saveToolkit', () => saveToolkit('13.4.2', OS.LINUX, KEY)],
  ])('%s logs the key when the entry is saved', async (_name, save) => {
    mocks.saveCache.mockResolvedValue(42);

    await save();

    expect(mocks.info).toHaveBeenCalledWith(`Cache saved with key: ${KEY}`);
  });

  it.each([
    ['saveInstaller', () => saveInstaller('cuda_13.4.2_linux.run', KEY)],
    ['saveToolkit', () => saveToolkit('13.4.2', OS.LINUX, KEY)],
  ])('%s does not log a save when the entry is not saved', async (_name, save) => {
    mocks.saveCache.mockResolvedValue(-1);

    await save();

    expect(mocks.info).not.toHaveBeenCalledWith(`Cache saved with key: ${KEY}`);
  });

  it('saves the toolkit directory under the given key', async () => {
    mocks.saveCache.mockResolvedValue(42);

    await saveToolkit('13.4.2', OS.WINDOWS, KEY);

    expect(mocks.saveCache).toHaveBeenCalledWith([WINDOWS_TOOLKIT_DIR], KEY);
  });

  it('turns a thrown save error into a warning', async () => {
    mocks.saveCache.mockRejectedValue(new Error('Path Validation Error'));

    await expect(saveToolkit('13.4.2', OS.LINUX, KEY)).resolves.toBeUndefined();

    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('Path Validation Error'));
  });
});
