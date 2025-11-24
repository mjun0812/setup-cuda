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

function setEnvironmentVariables(os: OS, cudaPath: string): void {
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
  }
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

    // Install CUDA
    let cudaPath: string | undefined = undefined;
    if (inputMethod === 'local') {
      // Local installation
      cudaPath = await installCudaLocal(targetCudaVersion, osType, arch);
    } else if (inputMethod === 'network') {
      // Network installation
      const networkCudaPath = await installCudaNetwork(
        targetCudaVersion,
        osType,
        arch,
        osType === OS.LINUX ? linuxDistribution! : windowsVersion!
      );
      if (!networkCudaPath) {
        throw new Error(`CUDA network installation failed for version ${targetCudaVersion}`);
      }
      cudaPath = networkCudaPath;
    } else if (inputMethod === 'auto') {
      // Auto installation (try network first, then local)
      try {
        cudaPath = await installCudaNetwork(
          targetCudaVersion,
          osType,
          arch,
          osType === OS.LINUX ? linuxDistribution! : windowsVersion!
        );
      } catch (error) {
        core.info(`CUDA network installation failed for version ${targetCudaVersion}: ${error}`);
        core.info('Falling back to local installation');
        cudaPath = await installCudaLocal(targetCudaVersion, osType, arch);
      }
    }
    if (!cudaPath) {
      throw new Error(`CUDA installation failed for version ${targetCudaVersion}`);
    }

    // Set environment variables
    setEnvironmentVariables(osType, cudaPath);

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

run();
