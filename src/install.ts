import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import {
  OS,
  Arch,
  LinuxDistribution,
  WindowsVersion,
  isDebianBased,
  isFedoraBased,
  getPackageManagerCommand,
} from './os_arch';
import { debugLog, hasRootPrivileges } from './utils';
import {
  getCudaLocalInstallerUrl,
  findCudaRepoAndPackageLinux,
  findCudaNetworkInstallerWindows,
} from './cuda';
import * as tc from '@actions/tool-cache';
import * as io from '@actions/io';

/**
 * Get sudo prefix for command execution
 * @returns 'sudo' if root privileges are not present, empty string otherwise
 */
function getSudoPrefix(): string {
  return hasRootPrivileges() ? '' : 'sudo';
}

/**
 * Install CUDA on Linux
 * @param installerPath - Path to the CUDA installer (.run file)
 */
async function installCudaLinuxLocal(installerPath: string): Promise<void> {
  // https://docs.nvidia.com/cuda/cuda-installation-guide-linux/#runfile-installation
  core.info('Installing CUDA on Linux...');
  const sudoPrefix = getSudoPrefix();
  const command = `${sudoPrefix} sh ${installerPath}`.trim();

  // Install CUDA toolkit only (without driver)
  // --silent: Run installer in silent mode
  // --toolkit: Install CUDA Toolkit only
  const installArgs = ['--silent', '--override', '--toolkit'];

  debugLog(`Executing: ${command} ${installArgs.join(' ')}`);
  await exec.exec(command, installArgs);

  // Verify installation
  const cudaPath = '/usr/local/cuda';
  if (!fs.existsSync(cudaPath)) {
    throw new Error(`CUDA installation failed. CUDA path not found: ${cudaPath}`);
  }
}

/**
 * Install CUDA on Windows
 * @param installerPath - Path to the CUDA installer (.exe file)
 * @param version - CUDA version string (e.g., "12.3.0")
 */
async function installCudaWindowsLocal(installerPath: string, version: string): Promise<void> {
  // https://docs.nvidia.com/cuda/cuda-installation-guide-microsoft-windows/index.html#install-the-cuda-software
  core.info('Installing CUDA on Windows...');

  // Install CUDA toolkit only (without driver)
  // -s: Silent installation
  const installArgs = ['-s'];

  core.info(`Executing: ${installerPath} ${installArgs.join(' ')}`);
  await exec.exec(installerPath, installArgs);

  // Get CUDA installation path
  // Windows default: C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v<version>
  const majorMinor = version.split('.').slice(0, 2).join('.');
  const cudaPath = `C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v${majorMinor}`;

  // Verify installation
  if (!fs.existsSync(cudaPath)) {
    throw new Error(`CUDA installation failed. Path not found: ${cudaPath}`);
  }
}

/**
 * Install CUDA
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @param arch - Architecture (e.g., Arch.X86_64, Arch.ARM64_SBSA)
 * @returns The path to the CUDA installation
 */
export async function installCudaLocal(version: string, os: OS, arch: Arch): Promise<string> {
  // Get CUDA installer URL
  const cudaInstallerUrl = await getCudaLocalInstallerUrl(version, os, arch);
  debugLog(`CUDA installer URL: ${cudaInstallerUrl}`);

  // Download CUDA installer
  core.info('Downloading CUDA installer...');
  let filename = path.basename(cudaInstallerUrl);
  if (os === OS.LINUX) {
    filename = `cuda_${version}_linux.run`;
  } else if (os === OS.WINDOWS) {
    filename = `cuda_${version}_windows.exe`;
  }
  let installerPath = await tc.downloadTool(cudaInstallerUrl, filename);
  installerPath = path.resolve(installerPath);
  core.info(`CUDA installer downloaded to: ${installerPath}`);

  // Install CUDA
  if (os === OS.LINUX) {
    try {
      await installCudaLinuxLocal(installerPath);
    } catch (error) {
      try {
        await exec.exec('cat /var/log/cuda-installer.log');
      } catch {
        // Ignore errors from log output
      }
      throw error;
    }
  } else if (os === OS.WINDOWS) {
    await installCudaWindowsLocal(installerPath, version);
  }
  // Remove installer
  core.info('Cleaning up installer...');
  await io.rmRF(installerPath);

  // Get CUDA installation path
  let cudaPath: string;
  if (os === OS.LINUX) {
    cudaPath = '/usr/local/cuda';
  } else {
    // Windows
    const majorMinor = version.split('.').slice(0, 2).join('.');
    cudaPath = `C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v${majorMinor}`;
  }
  // Remove installer
  await io.rmRF(installerPath);
  return cudaPath;
}

async function installCudaLinuxNetwork(
  version: string,
  arch: Arch,
  osInfo: LinuxDistribution
): Promise<string | undefined> {
  const cudaRepoAndPackage = await findCudaRepoAndPackageLinux(version, arch, osInfo);
  if (!cudaRepoAndPackage) {
    return undefined;
  }
  const repoUrl = cudaRepoAndPackage.repoUrl;
  const packageName = cudaRepoAndPackage.packageName;

  const sudoPrefix = getSudoPrefix();
  let cudaPath: string | undefined = undefined;
  try {
    if (isDebianBased(osInfo)) {
      // Set up CUDA repository
      let repoFilePath: string;
      try {
        repoFilePath = await tc.downloadTool(repoUrl);
      } catch (error) {
        throw new Error(`Failed to download CUDA repository file from ${repoUrl}: ${error}`);
      }
      repoFilePath = path.resolve(repoFilePath);

      if (repoUrl.endsWith('.deb')) {
        await exec.exec(`${sudoPrefix} dpkg -i ${repoFilePath}`.trim());
        await exec.exec(`${sudoPrefix} apt-get update`.trim());
      } else if (repoUrl.endsWith('.pin')) {
        await exec.exec(
          `${sudoPrefix} mv ${repoFilePath} /etc/apt/preferences.d/cuda-repository-pin-600`.trim()
        );
        const repoRootUrl = repoUrl.replace(/\/[\w.-]+\.pin$/, '');
        await exec.exec(`${sudoPrefix} add-apt-repository "deb ${repoRootUrl} /"`.trim());
        await exec.exec(`${sudoPrefix} apt-get update`.trim());
      }
      // Install CUDA toolkit
      await exec.exec(`${sudoPrefix} apt-get install -y ${packageName}`.trim());
      cudaPath = '/usr/local/cuda';
    } else if (isFedoraBased(osInfo)) {
      const packageManagerCommand = await getPackageManagerCommand(osInfo);
      await exec.exec(
        `${sudoPrefix} ${packageManagerCommand} config-manager --add-repo ${repoUrl}`.trim()
      );
      await exec.exec(`${sudoPrefix} ${packageManagerCommand} clean all`.trim());
      await exec.exec(`${sudoPrefix} ${packageManagerCommand} install -y ${packageName}`.trim());
      cudaPath = '/usr/local/cuda';
    }
  } catch (error) {
    throw new Error(`Failed to install CUDA via network: ${error}`);
  }
  return cudaPath;
}

/**
 * Install CUDA on Windows using network installer
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param arch - Architecture (e.g., Arch.X86_64)
 * @param osInfo - Windows version information
 * @returns The path to the CUDA installation, or undefined if network installer is not available
 */
async function installCudaWindowsNetwork(version: string): Promise<string | undefined> {
  const networkInstallerUrl = await findCudaNetworkInstallerWindows(version);
  if (!networkInstallerUrl) {
    throw new Error(`CUDA network installer not found for version ${version}`);
  }

  const filename = `cuda_${version}_windows_network.exe`;
  let installerPath: string;
  try {
    installerPath = await tc.downloadTool(networkInstallerUrl, filename);
  } catch (error) {
    throw new Error(
      `Failed to download CUDA network installer from ${networkInstallerUrl}: ${error} for version ${version}`
    );
  }
  installerPath = path.resolve(installerPath);

  // Install using the same method as local installer (silent mode)
  // -s: Silent installation
  const installArgs = ['-s'];

  core.info(`Installing CUDA on Windows (Network)...`);
  core.info(`Executing: ${installerPath} ${installArgs.join(' ')}`);

  // Execute installer
  try {
    await exec.exec(installerPath, installArgs);
  } catch (error) {
    throw new Error(`Failed to execute CUDA installer: ${error}`);
  }

  // Clean up installer
  await io.rmRF(installerPath);

  // Get CUDA installation path (same logic as local)
  const majorMinor = version.split('.').slice(0, 2).join('.');
  const cudaPath = `C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v${majorMinor}`;
  // Verify installation
  if (!fs.existsSync(cudaPath)) {
    throw new Error(`CUDA installation failed. Path not found: ${cudaPath}`);
  }

  return cudaPath;
}

export async function installCudaNetwork(
  version: string,
  os: OS,
  arch: Arch,
  osInfo: LinuxDistribution | WindowsVersion
): Promise<string | undefined> {
  if (os === OS.LINUX) {
    return await installCudaLinuxNetwork(version, arch, osInfo as LinuxDistribution);
  } else if (os === OS.WINDOWS) {
    return await installCudaWindowsNetwork(version);
  }
  return undefined;
}
