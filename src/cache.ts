import { OS, Arch, LinuxDistribution, WindowsVersion } from './os_arch';

/**
 * Get the cache key for a downloaded installer file
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @param arch - Architecture (e.g., Arch.X86_64, Arch.ARM64_SBSA)
 * @param installerUrl - URL the installer is downloaded from
 * @returns The cache key
 */
export function getInstallerCacheKey(_os: OS, _arch: Arch, _installerUrl: string): string {
  throw new Error('skeleton: not implemented');
}

/**
 * Restore an installer file from the cache
 * @param installerPath - Path the installer is downloaded to
 * @param key - Cache key from getInstallerCacheKey
 * @returns true if the installer was restored to installerPath
 */
export async function restoreInstaller(_installerPath: string, _key: string): Promise<boolean> {
  throw new Error('skeleton: not implemented');
}

/**
 * Save an installer file to the cache
 * @param installerPath - Path the installer was downloaded to
 * @param key - Cache key from getInstallerCacheKey
 */
export async function saveInstaller(_installerPath: string, _key: string): Promise<void> {
  throw new Error('skeleton: not implemented');
}

/**
 * Get the cache key for an installed CUDA toolkit
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @param arch - Architecture (e.g., Arch.X86_64, Arch.ARM64_SBSA)
 * @param method - Value of the method input (local, network, auto)
 * @param osInfo - Linux distribution or Windows version information
 * @returns The cache key
 */
export function getToolkitCacheKey(
  _version: string,
  _os: OS,
  _arch: Arch,
  _method: string,
  _osInfo: LinuxDistribution | WindowsVersion
): string {
  throw new Error('skeleton: not implemented');
}

/**
 * Get the directory the CUDA toolkit is installed to
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @returns /usr/local/cuda-<major>.<minor> on Linux, the versioned toolkit directory on Windows
 */
export function getToolkitDir(_version: string, _os: OS): string {
  throw new Error('skeleton: not implemented');
}

/**
 * Restore the CUDA toolkit from the cache
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @param key - Cache key from getToolkitCacheKey
 * @returns The CUDA path to export if the toolkit was restored, undefined otherwise
 */
export async function restoreToolkit(
  _version: string,
  _os: OS,
  _key: string
): Promise<string | undefined> {
  throw new Error('skeleton: not implemented');
}

/**
 * Save the installed CUDA toolkit to the cache
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @param key - Cache key from getToolkitCacheKey
 */
export async function saveToolkit(_version: string, _os: OS, _key: string): Promise<void> {
  throw new Error('skeleton: not implemented');
}
