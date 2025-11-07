import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Install CUDA on Linux
 * @param installerPath - Path to the CUDA installer (.run file)
 * @param version - CUDA version string (e.g., "12.3.0")
 */
export async function installCudaLinux(installerPath: string, version: string): Promise<void> {
  // https://docs.nvidia.com/cuda/cuda-installation-guide-linux/#runfile-installation
  core.info('Installing CUDA on Linux...');
  const absPath = path.resolve(installerPath);
  const command = `sudo sh ${absPath}`;

  // Make installer executable
  await exec.exec('chmod', ['+x', absPath]);

  // Install CUDA toolkit only (without driver)
  // --silent: Run installer in silent mode
  // --toolkit: Install CUDA Toolkit only
  const cudaPath = '/usr/local/cuda';
  const installArgs = ['--silent', '--toolkit', `--toolkitpath=${cudaPath}`];

  core.debug(`Executing: ${command} ${installArgs.join(' ')}`);
  await exec.exec(command, installArgs);

  // Set environment variables
  core.info('Setting environment variables...');
  const binPath = path.join(cudaPath, 'bin');
  const libPath = path.join(cudaPath, 'lib64');

  // Add to PATH
  core.addPath(binPath);

  // Set LD_LIBRARY_PATH
  core.exportVariable('LD_LIBRARY_PATH', `${libPath}:${process.env.LD_LIBRARY_PATH || ''}`);

  // Set CUDA_PATH
  core.exportVariable('CUDA_PATH', cudaPath);
  core.exportVariable('CUDA_HOME', cudaPath);

  core.info(`CUDA ${version} installed successfully at ${cudaPath}`);
}

/**
 * Install CUDA on Windows
 * @param installerPath - Path to the CUDA installer (.exe file)
 * @param version - CUDA version string (e.g., "12.3.0")
 */
export async function installCudaWindows(installerPath: string, version: string): Promise<void> {
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

  // Set environment variables
  core.info('Setting environment variables...');
  const binPath = path.join(cudaPath, 'bin');
  const libPath = path.join(cudaPath, 'lib', 'x64');

  // Add to PATH
  core.addPath(binPath);
  core.addPath(libPath);

  // Set CUDA_PATH
  core.exportVariable('CUDA_PATH', cudaPath);
  core.exportVariable('CUDA_HOME', cudaPath);

  core.info(`CUDA ${version} installed successfully at ${cudaPath}`);
}
