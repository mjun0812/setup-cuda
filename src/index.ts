import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
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
} from './os';
import { findCudaVersion, getCudaInstallerUrl } from './cuda';
import { installCudaLinux, installCudaWindows } from './install';

/**
 * Main entry point for the action
 */
async function run(): Promise<void> {
  try {
    // Get input version
    const inputVersion = core.getInput('version') || 'latest';
    core.info(`Input version: ${inputVersion}`);

    // Get OS and architecture
    const os = getOS();
    const arch = getArch();
    core.info(`OS: ${os}`);
    core.info(`Architecture: ${arch}`);
    if (os === OS.WINDOWS && arch === Arch.ARM64_SBSA) {
      throw new Error('CUDA is not supported on Windows with Arm architecture');
    }

    // Get Linux distribution or Windows version
    let linuxDistribution: LinuxDistribution | undefined;
    let windowsVersion: WindowsVersion | undefined;
    if (os === OS.LINUX) {
      linuxDistribution = getLinuxDistribution();
      core.info(
        `Linux distribution: ${linuxDistribution.id} ${linuxDistribution.version} ${linuxDistribution.name}`
      );
    } else if (os === OS.WINDOWS) {
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

    // Get CUDA installer URL
    const cudaInstallerUrl = await getCudaInstallerUrl(targetCudaVersion, os, arch);
    core.debug(`CUDA installer URL: ${cudaInstallerUrl}`);

    // Download CUDA installer
    core.info('Downloading CUDA installer...');
    const filename = path.basename(cudaInstallerUrl);
    const installerPath = await tc.downloadTool(cudaInstallerUrl, filename);
    core.debug(`CUDA installer downloaded to: ${filename}`);

    // Install CUDA
    if (os === OS.LINUX) {
      await installCudaLinux(installerPath, targetCudaVersion);
    } else if (os === OS.WINDOWS) {
      await installCudaWindows(installerPath, targetCudaVersion);
    }

    // Get CUDA installation path
    let cudaPath: string;
    if (os === OS.LINUX) {
      cudaPath = '/usr/local/cuda';
    } else {
      const majorMinor = targetCudaVersion.split('.').slice(0, 2).join('.');
      cudaPath = `C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v${majorMinor}`;
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
