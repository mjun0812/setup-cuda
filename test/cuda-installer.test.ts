import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Arch, OS } from '../src/os_arch';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('@actions/http-client', () => ({
  HttpClient: class {
    get = mocks.get;
  },
}));

import {
  findCudaInstallerFilename,
  findCudaNetworkInstallerWindows,
  getCudaLocalInstallerUrl,
} from '../src/cuda';

// https://developer.download.nvidia.com/compute/cuda/13.4.2/docs/sidebar/md5sum.txt
const MANIFEST_13_4_2 = readFileSync(
  new URL('./fixtures/md5sum_13.4.2.txt', import.meta.url),
  'utf-8'
);

function mockManifest(text: string): void {
  mocks.get.mockResolvedValue({
    message: { statusCode: 200 },
    readBody: async () => text,
  });
}

function manifest(filenames: string[]): string {
  return filenames.map((filename) => `0123456789abcdef0123456789abcdef ${filename}`).join('\n');
}

function url(version: string, dir: string, filename: string): string {
  return `https://developer.download.nvidia.com/compute/cuda/${version}/${dir}/${filename}`;
}

describe('CUDA 13.4.2 installer resolution from the official manifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockManifest(MANIFEST_13_4_2);
  });

  it.each([
    [OS.WINDOWS, Arch.X86_64, 'cuda_13.4.2_windows_x86_64.exe'],
    [OS.WINDOWS, Arch.ARM64_SBSA, 'cuda_13.4.2_windows_arm64.exe'],
    [OS.LINUX, Arch.X86_64, 'cuda_13.4.2_linux.run'],
    [OS.LINUX, Arch.ARM64_SBSA, 'cuda_13.4.2_linux_sbsa.run'],
  ])('resolves the local installer on %s %s', async (os, arch, filename) => {
    await expect(getCudaLocalInstallerUrl('13.4.2', os, arch)).resolves.toBe(
      url('13.4.2', 'local_installers', filename)
    );
    expect(mocks.get).toHaveBeenCalledWith(
      'https://developer.download.nvidia.com/compute/cuda/13.4.2/docs/sidebar/md5sum.txt'
    );
  });

  it.each([
    [Arch.X86_64, 'cuda_13.4.2_windows_x86_64_network.exe'],
    [Arch.ARM64_SBSA, 'cuda_13.4.2_windows_arm64_network.exe'],
  ])('resolves the Windows network installer on %s', async (arch, filename) => {
    await expect(findCudaNetworkInstallerWindows('13.4.2', arch)).resolves.toBe(
      url('13.4.2', 'network_installers', filename)
    );
  });
});

describe('CUDA installer resolution from older manifests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const cases = [
    {
      version: '13.0.3',
      filenames: [
        'cuda_13.0.3_580.126.20_linux_sbsa.run',
        'cuda_13.0.3_580.126.20_linux.run',
        'cuda_13.0.3_windows.exe',
        'cuda_13.0.3_windows_network.exe',
      ],
      linuxX86: 'cuda_13.0.3_580.126.20_linux.run',
      linuxSbsa: 'cuda_13.0.3_580.126.20_linux_sbsa.run',
      windowsLocal: 'cuda_13.0.3_windows.exe',
      windowsNetwork: 'cuda_13.0.3_windows_network.exe',
    },
    {
      version: '12.9.1',
      filenames: [
        'cuda_12.9.1_575.57.08_linux_sbsa.run',
        'cuda_12.9.1_575.57.08_linux.run',
        'cuda_12.9.1_576.57_windows.exe',
        'cuda_12.9.1_windows_network.exe',
      ],
      linuxX86: 'cuda_12.9.1_575.57.08_linux.run',
      linuxSbsa: 'cuda_12.9.1_575.57.08_linux_sbsa.run',
      windowsLocal: 'cuda_12.9.1_576.57_windows.exe',
      windowsNetwork: 'cuda_12.9.1_windows_network.exe',
    },
    {
      // The local installer uses the old naming and the network installer uses the new one
      version: '12.9.2',
      filenames: [
        'cuda_12.9.2_575.57.08_linux_sbsa.run',
        'cuda_12.9.2_575.57.08_linux.run',
        'cuda_12.9.2_576.57_windows.exe',
        'cuda_12.9.2_windows_x86_64_network.exe',
      ],
      linuxX86: 'cuda_12.9.2_575.57.08_linux.run',
      linuxSbsa: 'cuda_12.9.2_575.57.08_linux_sbsa.run',
      windowsLocal: 'cuda_12.9.2_576.57_windows.exe',
      windowsNetwork: 'cuda_12.9.2_windows_x86_64_network.exe',
    },
    {
      version: '11.0.3',
      filenames: [
        'cuda_11.0.3_450.51.06_linux_ppc64le.run',
        'cuda_11.0.3_450.51.06_linux.run',
        'cuda_11.0.3_450.51.06_linux_sbsa.run',
        'cuda_11.0.3_451.82_win10.exe',
        'cuda_11.0.3_win10_network.exe',
      ],
      linuxX86: 'cuda_11.0.3_450.51.06_linux.run',
      linuxSbsa: 'cuda_11.0.3_450.51.06_linux_sbsa.run',
      windowsLocal: 'cuda_11.0.3_451.82_win10.exe',
      windowsNetwork: 'cuda_11.0.3_win10_network.exe',
    },
  ];

  cases.forEach(({ version, filenames, linuxX86, linuxSbsa, windowsLocal, windowsNetwork }) => {
    it(`resolves CUDA ${version} installers`, async () => {
      mockManifest(manifest(filenames));

      await expect(getCudaLocalInstallerUrl(version, OS.LINUX, Arch.X86_64)).resolves.toBe(
        url(version, 'local_installers', linuxX86)
      );
      await expect(getCudaLocalInstallerUrl(version, OS.LINUX, Arch.ARM64_SBSA)).resolves.toBe(
        url(version, 'local_installers', linuxSbsa)
      );
      await expect(getCudaLocalInstallerUrl(version, OS.WINDOWS, Arch.X86_64)).resolves.toBe(
        url(version, 'local_installers', windowsLocal)
      );
      await expect(findCudaNetworkInstallerWindows(version, Arch.X86_64)).resolves.toBe(
        url(version, 'network_installers', windowsNetwork)
      );
    });

    it(`does not use the x86_64 installer of CUDA ${version} for Windows ARM64`, async () => {
      mockManifest(manifest(filenames));

      await expect(getCudaLocalInstallerUrl(version, OS.WINDOWS, Arch.ARM64_SBSA)).rejects.toThrow(
        `No matching CUDA installer found for version ${version} on windows with architecture arm64-sbsa`
      );
      await expect(findCudaNetworkInstallerWindows(version, Arch.ARM64_SBSA)).resolves.toBe(
        undefined
      );
    });
  });

  it('fails when the manifest has no installer entries', async () => {
    mockManifest('\nnot-a-manifest-line\n0123456789abcdef0123456789abcdef\n');

    await expect(getCudaLocalInstallerUrl('13.4.2', OS.LINUX, Arch.X86_64)).rejects.toThrow(
      'No matching CUDA installer found for version 13.4.2 on linux with architecture x86_64'
    );
    await expect(findCudaNetworkInstallerWindows('13.4.2', Arch.X86_64)).resolves.toBe(undefined);
  });
});

describe('CUDA installer filename matching', () => {
  it('distinguishes x86_64 and ARM64 Windows installers', () => {
    const x86Only = ['cuda_13.4.2_windows_x86_64.exe', 'cuda_13.4.2_windows_x86_64_network.exe'];
    const arm64Only = ['cuda_13.4.2_windows_arm64.exe', 'cuda_13.4.2_windows_arm64_network.exe'];

    expect(
      findCudaInstallerFilename(x86Only, '13.4.2', OS.WINDOWS, Arch.ARM64_SBSA, 'local')
    ).toBeUndefined();
    expect(
      findCudaInstallerFilename(x86Only, '13.4.2', OS.WINDOWS, Arch.ARM64_SBSA, 'network')
    ).toBeUndefined();
    expect(
      findCudaInstallerFilename(arm64Only, '13.4.2', OS.WINDOWS, Arch.X86_64, 'local')
    ).toBeUndefined();
    expect(
      findCudaInstallerFilename(arm64Only, '13.4.2', OS.WINDOWS, Arch.X86_64, 'network')
    ).toBeUndefined();
  });

  it('distinguishes x86_64 and SBSA Linux installers', () => {
    expect(
      findCudaInstallerFilename(
        ['cuda_13.4.2_linux_sbsa.run'],
        '13.4.2',
        OS.LINUX,
        Arch.X86_64,
        'local'
      )
    ).toBeUndefined();
    expect(
      findCudaInstallerFilename(
        ['cuda_13.4.2_linux.run'],
        '13.4.2',
        OS.LINUX,
        Arch.ARM64_SBSA,
        'local'
      )
    ).toBeUndefined();
  });

  it('prefers the architecture-specific Windows installer', () => {
    const filenames = ['cuda_13.4.2_windows.exe', 'cuda_13.4.2_windows_x86_64.exe'];
    expect(findCudaInstallerFilename(filenames, '13.4.2', OS.WINDOWS, Arch.X86_64, 'local')).toBe(
      'cuda_13.4.2_windows_x86_64.exe'
    );
  });

  it('does not mix local and network installers', () => {
    expect(
      findCudaInstallerFilename(
        ['cuda_13.4.2_windows_x86_64_network.exe', 'cuda_13.0.3_windows_network.exe'],
        '13.4.2',
        OS.WINDOWS,
        Arch.X86_64,
        'local'
      )
    ).toBeUndefined();
    expect(
      findCudaInstallerFilename(
        ['cuda_13.4.2_windows_x86_64.exe', 'cuda_12.9.1_576.57_windows.exe'],
        '13.4.2',
        OS.WINDOWS,
        Arch.X86_64,
        'network'
      )
    ).toBeUndefined();
  });

  it('ignores installers of other versions', () => {
    const filenames = [
      'cuda_13.4.1_linux.run',
      'cuda_13.4.21_linux.run',
      'cuda_113.4.2_linux.run',
      'cuda_13.4.2.1_linux.run',
      'cuda_13x4x2_linux.run',
      'cuda_13.4.1_windows_x86_64.exe',
      'cuda_13.4.20_windows_x86_64.exe',
      'cuda_13.4.21_610.43.02_windows.exe',
      'cuda_13.4.1_windows_x86_64_network.exe',
    ];
    for (const os of [OS.LINUX, OS.WINDOWS]) {
      expect(
        findCudaInstallerFilename(filenames, '13.4.2', os, Arch.X86_64, 'local')
      ).toBeUndefined();
    }
    expect(
      findCudaInstallerFilename(filenames, '13.4.2', OS.WINDOWS, Arch.X86_64, 'network')
    ).toBeUndefined();
    expect(findCudaInstallerFilename(filenames, '13.4.1', OS.LINUX, Arch.X86_64, 'local')).toBe(
      'cuda_13.4.1_linux.run'
    );
  });

  it('ignores malformed and other kinds of files', () => {
    const filenames = [
      '',
      'undefined',
      'xcuda_13.4.2_linux.run',
      'cuda_13.4.2_linux.run.bak',
      'cuda_13.4.2_abc_linux.run',
      'cuda_13.4.2_linux_ppc64le.run',
      'cuda_13.4.2_windows_x86_64',
      'cuda_13.4.2_windows_x86_64.exe.sig',
      'cuda_13.4.2_windows_x86_64_network.msi',
      'cuda_13.4.2_windows_aarch64.exe',
      'cuda-repo-13.4.2_windows_x86_64.exe',
    ];
    for (const arch of [Arch.X86_64, Arch.ARM64_SBSA]) {
      for (const os of [OS.LINUX, OS.WINDOWS]) {
        expect(findCudaInstallerFilename(filenames, '13.4.2', os, arch, 'local')).toBeUndefined();
      }
      expect(
        findCudaInstallerFilename(filenames, '13.4.2', OS.WINDOWS, arch, 'network')
      ).toBeUndefined();
    }
  });

  it('rejects the Linux network installer lookup', () => {
    expect(() => findCudaInstallerFilename([], '13.4.2', OS.LINUX, Arch.X86_64, 'network')).toThrow(
      'Unsupported CUDA network installer for linux with architecture x86_64'
    );
  });
});
