import * as core from '@actions/core';
import * as path from 'path';
import {
  getOS,
  getArch,
  OS,
  Arch,
  LinuxDistribution,
  getLinuxDistribution,
  WindowsVersion,
  getWindowsVersion,
} from './os_arch';
import { findCudaVersion } from './cuda';
import { installCudaLocal, installCudaNetwork } from './install';
import { getToolkitCacheKey, restoreToolkit, saveToolkit } from './cache';
import { getErrorMessage } from './utils';

function setEnvironmentVariables(os: OS, cudaPath: string, version: string): void {
  if (os === OS.LINUX) {
    core.addPath(path.join(cudaPath, 'bin'));
    core.exportVariable('CUDA_PATH', cudaPath);
    core.exportVariable('CUDA_HOME', cudaPath);
    core.exportVariable(
      'LD_LIBRARY_PATH',
      `${path.join(cudaPath, 'lib64')}:${process.env.LD_LIBRARY_PATH || ''}`
    );
  } else if (os === OS.WINDOWS) {
    core.addPath(path.join(cudaPath, 'bin'));
    core.addPath(path.join(cudaPath, 'lib', 'x64'));
    core.exportVariable('CUDA_PATH', cudaPath);
    core.exportVariable('CUDA_HOME', cudaPath);
    // NVIDIA's MSBuild integration finds the toolkit through this variable, and the
    // machine-level value the installer sets does not reach later steps of the running job.
    const [major, minor] = version.split('.');
    core.exportVariable(`CUDA_PATH_V${major}_${minor}`, cudaPath);
  }
}

async function installCuda(
  version: string,
  osType: OS,
  arch: Arch,
  method: 'local' | 'network' | 'auto',
  osInfo: LinuxDistribution | WindowsVersion,
  cacheInstaller: boolean
): Promise<string> {
  let cudaPath: string | undefined = undefined;
  if (method === 'local') {
    // Local installation
    cudaPath = await installCudaLocal(version, osType, arch, cacheInstaller);
  } else if (method === 'network') {
    // Network installation
    const networkCudaPath = await installCudaNetwork(version, osType, arch, osInfo, cacheInstaller);
    if (!networkCudaPath) {
      throw new Error(`CUDA network installation failed for version ${version}`);
    }
    cudaPath = networkCudaPath;
  } else if (method === 'auto') {
    // Auto installation (try network first, then local)
    try {
      cudaPath = await installCudaNetwork(version, osType, arch, osInfo, cacheInstaller);
    } catch (error) {
      core.info(
        `CUDA network installation failed for version ${version}: ${getErrorMessage(error)}`
      );
      core.info('Falling back to local installation');
      cudaPath = await installCudaLocal(version, osType, arch, cacheInstaller);
    }
  }
  if (!cudaPath) {
    throw new Error(`CUDA installation failed for version ${version}`);
  }
  return cudaPath;
}

async function run(): Promise<void> {
  try {
    // Get input version
    const inputVersion = core.getInput('version') || 'latest';
    core.info(`Input version: ${inputVersion}`);

    // Get input method
    const inputMethod = (core.getInput('method') || 'auto') as 'local' | 'network' | 'auto';
    if (!['local', 'network', 'auto'].includes(inputMethod)) {
      throw new Error(`Invalid method: ${inputMethod}. Valid methods are: local, network, auto`);
    }
    core.info(`Input method: ${inputMethod}`);

    const cacheInstaller = core.getBooleanInput('cache-installer');
    core.info(`Input cache-installer: ${cacheInstaller}`);
    const cacheToolkit = core.getBooleanInput('cache-toolkit');
    core.info(`Input cache-toolkit: ${cacheToolkit}`);

    // Get OS and architecture
    const osType = getOS();
    const arch = getArch();
    core.info(`OS: ${osType}`);
    core.info(`Architecture: ${arch}`);
    if (osType === OS.WINDOWS && arch === Arch.ARM64_SBSA) {
      throw new Error('CUDA is not supported on Windows with Arm architecture');
    }

    // Get Linux distribution or Windows version
    let linuxDistribution: LinuxDistribution | undefined;
    let windowsVersion: WindowsVersion | undefined;
    if (osType === OS.LINUX) {
      linuxDistribution = getLinuxDistribution();
      core.info(
        `Linux distribution: ${linuxDistribution.id} ${linuxDistribution.version} ${linuxDistribution.name} ${linuxDistribution.idLink}`
      );
    } else if (osType === OS.WINDOWS) {
      windowsVersion = getWindowsVersion();
      core.info(
        `Windows version: ${windowsVersion.name} (${windowsVersion.release}, build ${windowsVersion.build})`
      );
    }

    // Find target CUDA version
    const targetCudaVersion = await findCudaVersion(inputVersion);
    if (!targetCudaVersion) {
      throw new Error(`CUDA version (${inputVersion}) is not found`);
    }
    core.info(`Target CUDA version: ${targetCudaVersion}`);

    const osInfo = osType === OS.LINUX ? linuxDistribution! : windowsVersion!;
    const toolkitCacheKey = getToolkitCacheKey(
      targetCudaVersion,
      osType,
      arch,
      inputMethod,
      osInfo
    );
    let cudaPath = cacheToolkit
      ? await restoreToolkit(targetCudaVersion, osType, toolkitCacheKey)
      : undefined;
    if (!cudaPath) {
      cudaPath = await installCuda(
        targetCudaVersion,
        osType,
        arch,
        inputMethod,
        osInfo,
        cacheInstaller
      );
      if (cacheToolkit) {
        await saveToolkit(targetCudaVersion, osType, toolkitCacheKey);
      }
    }

    // Set environment variables
    setEnvironmentVariables(osType, cudaPath, targetCudaVersion);

    // Set outputs
    core.setOutput('version', targetCudaVersion);
    core.setOutput('cuda-path', cudaPath);
    core.info('CUDA installation completed successfully');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

void run();
