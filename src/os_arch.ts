import * as os from 'os';
import * as fs from 'fs';
import { which } from '@actions/io';

/**
 * Supported operating systems
 */
export enum OS {
  LINUX = 'linux',
  WINDOWS = 'windows',
}

/**
 * Supported architectures
 */
export enum Arch {
  X86_64 = 'x86_64',
  ARM64_SBSA = 'arm64-sbsa',
}

/**
 * Linux distribution information
 */
export interface LinuxDistribution {
  id: string;
  version: string;
  name: string;
  idLink: string;
}

/**
 * Windows version information
 */
export interface WindowsVersion {
  name: string;
  release: string;
  build: number;
}

/**
 * Get the current operating system
 * @returns The operating system type
 */
export function getOS(): OS {
  const platform = os.platform();

  switch (platform) {
    case 'linux':
      return OS.LINUX;
    case 'win32':
      return OS.WINDOWS;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get the current system architecture
 * @returns The architecture type
 */
export function getArch(): Arch {
  const arch = os.arch();

  switch (arch) {
    case 'x64':
      return Arch.X86_64;
    case 'arm64':
      return Arch.ARM64_SBSA;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
}

/**
 * Parse /etc/os-release file to get Linux distribution information
 * @returns Linux distribution information
 */
export function getLinuxDistribution(): LinuxDistribution {
  const currentOS = getOS();

  if (currentOS !== OS.LINUX) {
    throw new Error('This function is only available on Linux');
  }

  const osReleasePath = '/etc/os-release';
  if (!fs.existsSync(osReleasePath)) {
    throw new Error('Could not find /etc/os-release file');
  }

  const content = fs.readFileSync(osReleasePath, 'utf-8');
  const lines = content.split('\n');

  let id = '';
  let version = '';
  let name = '';
  let idLink = '';

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.includes('=')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      const value = valueParts.join('=').replace(/"/g, '');

      if (key === 'ID') {
        id = value;
      } else if (key === 'VERSION_ID') {
        version = value;
      } else if (key === 'NAME') {
        name = value;
      } else if (key === 'ID_LIKE') {
        idLink = value;
      }
    }
  }

  if (!id) {
    throw new Error('Could not determine Linux distribution ID');
  }

  return {
    id,
    version: version || 'unknown',
    name: name || id,
    idLink: idLink,
  };
}

/**
 * Get Windows version information
 * @returns Windows version information
 */
export function getWindowsVersion(): WindowsVersion {
  const currentOS = getOS();

  if (currentOS !== OS.WINDOWS) {
    throw new Error('This function is only available on Windows');
  }

  // os.release() returns something like "10.0.22621"
  const release = os.release();
  const parts = release.split('.');

  if (parts.length < 3) {
    throw new Error(`Unable to parse Windows version: ${release}`);
  }

  const build = parseInt(parts[2], 10);

  // Determine Windows version name based on build number
  let name: string;

  if (build >= 22000) {
    name = 'Windows 11';
  } else if (build >= 20348) {
    name = 'Windows Server 2022';
  } else if (build >= 17763) {
    if (build >= 19041) {
      name = 'Windows 10';
    } else {
      name = 'Windows Server 2019';
    }
  } else if (build >= 10240) {
    name = 'Windows 10';
  } else {
    name = 'Windows (Unknown)';
  }

  return {
    name,
    release,
    build,
  };
}

/**
 * Check if the distribution is Debian-based
 * @param osInfo - Linux distribution information
 * @returns True if the distribution is Debian-based
 */
export function isDebianBased(osInfo: LinuxDistribution): boolean {
  return osInfo.id === 'debian' || osInfo.idLink.includes('debian');
}

/**
 * Check if the distribution is Fedora-based
 * @param osInfo - Linux distribution information
 * @returns True if the distribution is Fedora-based
 */
export function isFedoraBased(osInfo: LinuxDistribution): boolean {
  return osInfo.id === 'fedora' || osInfo.idLink.includes('fedora');
}

/**
 * Get package manager command for the distribution
 * @returns Package manager command
 */
export async function getPackageManagerCommand(osInfo: LinuxDistribution): Promise<string> {
  if (isDebianBased(osInfo)) {
    return 'apt';
  } else if (isFedoraBased(osInfo)) {
    // yum or dnf
    const dnf = await which('dnf', true);
    const yum = await which('yum', true);
    if (dnf) {
      return 'dnf';
    } else if (yum) {
      return 'yum';
    }
    throw new Error(`Package manager not found`);
  }
  throw new Error(`Unsupported distribution: ${osInfo.id}`);
}
