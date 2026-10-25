import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as fs from 'fs';
import * as path from 'path';
import { OS, Arch, LinuxDistribution, WindowsVersion } from './os_arch';
import { getErrorMessage, hasRootPrivileges } from './utils';

/**
 * Get the cache key for a downloaded installer file
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @param arch - Architecture (e.g., Arch.X86_64, Arch.ARM64_SBSA)
 * @param installerUrl - URL the installer is downloaded from
 * @returns The cache key
 */
export function getInstallerCacheKey(os: OS, arch: Arch, installerUrl: string): string {
  return `setup-cuda-installer-${os}-${arch}-${path.posix.basename(installerUrl)}`;
}

/**
 * Restore an installer file from the cache
 * @param installerPath - Path the installer is downloaded to
 * @param key - Cache key from getInstallerCacheKey
 * @returns true if the installer was restored to installerPath
 */
export async function restoreInstaller(installerPath: string, key: string): Promise<boolean> {
  // A file already at the destination did not come from this action. Restoring would overwrite
  // it and the cleanup after installing would delete it, so it is left for the download to
  // reject, as it does without the cache.
  if (fs.existsSync(installerPath)) {
    return false;
  }
  if ((await cache.restoreCache([installerPath], key)) !== undefined) {
    return true;
  }
  // A failed extraction is reported as a miss but can leave a partial file behind,
  // and downloadTool refuses to write to an existing destination.
  await io.rmRF(installerPath);
  return false;
}

/**
 * Save paths to the cache without ever failing the action
 * @param paths - Paths to save
 * @param key - Cache key
 */
async function save(paths: string[], key: string): Promise<void> {
  // saveCache throws before its own error handling when the paths match nothing or its
  // temporary directory cannot be created; a failed save must never fail the action.
  try {
    const cacheId = await cache.saveCache(paths, key);
    if (cacheId !== -1) {
      core.info(`Cache saved with key: ${key}`);
    }
  } catch (error) {
    core.warning(`Failed to save cache with key ${key}: ${getErrorMessage(error)}`);
  }
}

/**
 * Save an installer file to the cache
 * @param installerPath - Path the installer was downloaded to
 * @param key - Cache key from getInstallerCacheKey
 */
export async function saveInstaller(installerPath: string, key: string): Promise<void> {
  await save([installerPath], key);
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
  version: string,
  os: OS,
  arch: Arch,
  method: string,
  osInfo: LinuxDistribution | WindowsVersion
): string {
  if (os === OS.LINUX) {
    // A toolkit installed with apt or dnf depends on the distribution repository.
    const distribution = osInfo as LinuxDistribution;
    return `setup-cuda-toolkit-linux-${arch}-${distribution.id}-${distribution.version}-${version}-${method}`;
  }
  return `setup-cuda-toolkit-windows-${arch}-${version}-${method}`;
}

/**
 * Get the directory the CUDA toolkit is installed to
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @returns /usr/local/cuda-<major>.<minor> on Linux, the versioned toolkit directory on Windows
 */
export function getToolkitDir(version: string, os: OS): string {
  const majorMinor = version.split('.').slice(0, 2).join('.');
  if (os === OS.LINUX) {
    return `/usr/local/cuda-${majorMinor}`;
  }
  return `C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v${majorMinor}`;
}

/**
 * Restore the Linux toolkit into root-owned /usr/local and point /usr/local/cuda at it
 * @param toolkitDir - Toolkit directory from getToolkitDir
 * @param key - Cache key from getToolkitCacheKey
 * @returns /usr/local/cuda if the toolkit was restored, undefined otherwise
 */
async function restoreToolkitLinux(toolkitDir: string, key: string): Promise<string | undefined> {
  if ((await cache.restoreCache([toolkitDir], key, [], { lookupOnly: true })) === undefined) {
    return undefined;
  }
  // The cache extracts as the runner user, who cannot create directories in /usr/local,
  // so the directory is created and handed over only once an entry is known to exist.
  const sudoPrefix = hasRootPrivileges() ? '' : 'sudo ';
  await exec.exec(`${sudoPrefix}mkdir -p ${toolkitDir}`);
  await exec.exec(`${sudoPrefix}chown ${process.getuid!()}:${process.getgid!()} ${toolkitDir}`);
  if ((await cache.restoreCache([toolkitDir], key)) === undefined) {
    return undefined;
  }
  const cudaPath = '/usr/local/cuda';
  // -T fails instead of linking inside /usr/local/cuda when that is a real directory,
  // which would otherwise publish whatever CUDA it already holds.
  await exec.exec(`${sudoPrefix}ln -sfnT ${toolkitDir} ${cudaPath}`);
  return cudaPath;
}

/**
 * Copy the CUDA MSBuild integration of a restored toolkit into every Visual Studio installation,
 * because the restore does not run the installer step that puts it there
 * @param toolkitDir - Toolkit directory from getToolkitDir
 */
async function installVisualStudioIntegration(toolkitDir: string): Promise<void> {
  const vswhere = path.win32.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe'
  );
  if (!fs.existsSync(vswhere)) {
    core.info(`${vswhere} not found, skipping the Visual Studio integration`);
    return;
  }
  const { stdout } = await exec.getExecOutput(`"${vswhere}"`, [
    '-products',
    '*',
    '-property',
    'installationPath',
  ]);
  const buildCustomizationDirs = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .flatMap((installationPath) => {
      // Visual Studio 2017 keeps its VC targets under Common7; later versions under MSBuild\Microsoft\VC\v*
      const dirs = [
        path.win32.join(
          installationPath,
          'Common7',
          'IDE',
          'VC',
          'VCTargets',
          'BuildCustomizations'
        ),
      ];
      const vcDir = path.win32.join(installationPath, 'MSBuild', 'Microsoft', 'VC');
      if (fs.existsSync(vcDir)) {
        dirs.push(
          ...fs
            .readdirSync(vcDir)
            .filter((name) => name.startsWith('v'))
            .map((name) => path.win32.join(vcDir, name, 'BuildCustomizations'))
        );
      }
      return dirs.filter((dir) => fs.existsSync(dir));
    });

  const extensionsDir = path.win32.join(
    toolkitDir,
    'extras',
    'visual_studio_integration',
    'MSBuildExtensions'
  );
  const files = fs.readdirSync(extensionsDir);
  for (const dir of buildCustomizationDirs) {
    core.info(`Copying the CUDA Visual Studio integration to ${dir}`);
    for (const file of files) {
      await io.cp(path.win32.join(extensionsDir, file), path.win32.join(dir, file));
    }
  }
}

/**
 * Restore the CUDA toolkit from the cache
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @param key - Cache key from getToolkitCacheKey
 * @returns The CUDA path to export if the toolkit was restored, undefined otherwise
 */
export async function restoreToolkit(
  version: string,
  os: OS,
  key: string
): Promise<string | undefined> {
  const toolkitDir = getToolkitDir(version, os);
  if (os === OS.LINUX) {
    return await restoreToolkitLinux(toolkitDir, key);
  }
  if ((await cache.restoreCache([toolkitDir], key)) === undefined) {
    return undefined;
  }
  await installVisualStudioIntegration(toolkitDir);
  return toolkitDir;
}

/**
 * Save the installed CUDA toolkit to the cache
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @param key - Cache key from getToolkitCacheKey
 */
export async function saveToolkit(version: string, os: OS, key: string): Promise<void> {
  await save([getToolkitDir(version, os)], key);
}
