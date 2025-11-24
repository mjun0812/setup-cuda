import * as core from '@actions/core';
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

/**
 * Main entry point for the action
 */
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
        `Linux distribution: ${linuxDistribution.id} ${linuxDistribution.version} ${linuxDistribution.name}`
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
    let cudaPath: string = '';
    if (inputMethod === 'local') {
      // Local installation
      cudaPath = await installCudaLocal(targetCudaVersion, osType, arch);
    } else {
      // Network installation
      const networkCudaPath = await installCudaNetwork(
        targetCudaVersion,
        osType,
        arch,
        osType === OS.LINUX ? linuxDistribution! : windowsVersion!
      );
      if (!networkCudaPath && inputMethod === 'network') {
        throw new Error('CUDA network installation failed');
      } else if (!networkCudaPath && inputMethod === 'auto') {
        core.info('CUDA network installation failed, falling back to local installation');
        cudaPath = await installCudaLocal(targetCudaVersion, osType, arch);
      } else {
        // Network installation succeeded
        cudaPath = networkCudaPath!;
      }
    }

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
