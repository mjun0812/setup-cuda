# setup-cuda

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/mjun0812/setup-cuda)](https://github.com/mjun0812/setup-cuda/releases)
[![GitHub](https://img.shields.io/github/license/mjun0812/setup-cuda)](https://github.com/mjun0812/setup-cuda)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Setup%20CUDA-blue.svg)](https://github.com/marketplace/actions/mjun0812-setup-cuda)  
[![github-sponsor](https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#white)](https://github.com/sponsors/mjun0812)
[![buy-me-a-coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/mjun0812)

Set up a specific version of NVIDIA CUDA in GitHub Actions.

## Features

- 🚀 **Dynamic Version Selection**: Install any CUDA version without waiting for action updates
- 🎯 **Flexible Version Specification**: Support for `latest`, `Major`, `Major.Minor`, or `Major.Minor.Patch` formats
- ⚡️ **Automatic Installation Method Selection**: Intelligently chooses between network and local installers
- 💻 **Cross-Platform Support**: Works on both Linux (x86_64 and ARM64) and Windows (x86_64) runners
- 🥗 **Supports Both Debian-based and Fedora-based Distributions**: Works seamlessly on Ubuntu, Debian, Fedora, AlmaLinux, and other related container/VM environments
- 🛠️ **Environment Configuration**: Automatically sets up all necessary environment variables
- ✅ **Supported Versions**: Supports CUDA versions >= 10.0

## Tested Platforms

- **Linux**: ubuntu-latest, ubuntu-24.04, ubuntu-22.04, ubuntu-24.04-arm, ubuntu-22.04-arm, fedora, almalinux, manylinux_2_28_x86_64
- **Windows**: windows-latest, windows-2025, windows-2022

## Quick Start

```yaml
steps:
  - name: Setup CUDA
    uses: mjun0812/setup-cuda@v1
    with:
      version: '12.4'
```

## Usage Examples

### Install the latest CUDA version

```yaml
steps:
  - name: Setup latest CUDA
    uses: mjun0812/setup-cuda@v1
    with:
      version: 'latest'
```

### Install a specific major.minor version

The latest patch version will be automatically selected.

```yaml
steps:
  - name: Setup CUDA 12.4
    uses: mjun0812/setup-cuda@v1
    with:
      version: '12.4'
```

### Install a specific patch version

```yaml
steps:
  - name: Setup CUDA 12.4.1
    uses: mjun0812/setup-cuda@v1
    with:
      version: '12.4.1'
```

### Specify installation method

```yaml
steps:
  - name: Setup CUDA with network installer
    uses: mjun0812/setup-cuda@v1
    with:
      version: '12.4'
      method: 'network'  # or 'local', 'auto'
```

### Install CUDA on Fedora-based distribution

```yaml
TestContainer:
  runs-on: ubuntu-latest
  container:
    image: fedora:latest

  steps:
    - name: Install System Dependencies
      shell: bash
      run: |
        # POSIX-compatible redirection so it works even without bash
        if command -v dnf >/dev/null 2>&1; then
          echo "dnf found"
          dnf install -y --allowerasing libxml2 wget gcc gcc-c++ make curl sudo git
        elif command -v yum >/dev/null 2>&1; then
          echo "yum found"
          yum install -y libxml2 wget gcc gcc-c++ make curl sudo git
        elif command -v apt-get >/dev/null 2>&1; then
          echo "apt-get found"
          apt-get update
          apt-get install -y libxml2 curl wget build-essential sudo git
        fi

    - name: Setup CUDA
      uses: mjun0812/setup-cuda@v1
      with:
        version: '12.4'
```

## Inputs

### `version`

**Description**: The version of NVIDIA CUDA to install (supports versions > 10.0).

**Format**:

- `latest`: Install the latest available version
- `Major` (e.g., `13`): Install the latest minor version for the specified major version
- `Major.Minor` (e.g., `12.4`): Install the latest patch version for the specified major.minor version
- `Major.Minor.Patch` (e.g., `12.4.1`): Install the exact version specified

**Required**: No
**Default**: `latest`

### `method`

**Description**: The method to use to install CUDA.

**Options**:

- `auto`: Tries the `network` method first. If it fails or is unavailable, falls back to `local`
- `network`: Uses the CUDA network installer. Faster download, but supported combinations of CUDA versions and OS are limited
- `local`: Downloads the full local installer. More robust availability, but larger download size

**Required**: No
**Default**: `auto`

## Outputs

### `version`

The full version string of NVIDIA CUDA that was actually installed (e.g., `12.4.1`).

**Example**:

```yaml
- name: Setup CUDA
  id: cuda
  uses: mjun0812/setup-cuda@v1
  with:
    version: '12.4'

- name: Print installed version
  run: echo "Installed CUDA version ${{ steps.cuda.outputs.version }}"
```

### `cuda-path`

The absolute path to the NVIDIA CUDA installation directory.

**Example**:

```yaml
- name: Setup CUDA
  id: cuda
  uses: mjun0812/setup-cuda@v1

- name: Use CUDA path
  run: echo "CUDA installed at ${{ steps.cuda.outputs.cuda-path }}"
```

## Environment Variables

This action automatically configures the following environment variables for subsequent steps:

### Common (Linux and Windows)

- `CUDA_PATH`: Path to the CUDA installation directory
- `CUDA_HOME`: Alias for `CUDA_PATH` (commonly used by build systems)
- `PATH`: Prepends `${CUDA_PATH}/bin` for access to CUDA binaries (nvcc, etc.)

### Linux-specific

- `LD_LIBRARY_PATH`: Prepends `${CUDA_PATH}/lib64` for runtime library loading

### Windows-specific

- `PATH`: Also includes `${CUDA_PATH}/lib/x64` for DLL access

## Troubleshooting

### CUDA installation fails with network method

If the network installer fails, the action will automatically fall back to the local installer when using `method: auto`. You can also explicitly specify `method: local`.

```yaml
- name: Setup CUDA with local installer
  uses: mjun0812/setup-cuda@v1
  with:
    version: '12.4'
    method: 'local'
```

### Specific version not found

Ensure the version you specified is available on the NVIDIA website. You can check available versions at:

- [CUDA Toolkit Archive](https://developer.nvidia.com/cuda-toolkit-archive)

### No space left on device

If you encounter an error like `No space left on device`, you can try to expand the disk space before running the action:

```yaml
- name: Expand disk space
  run: |
    df -h
    sudo rm -rf /usr/share/dotnet || true
    sudo rm -rf /usr/local/lib/android || true
    echo "-------"
    df -h
```

## Questions

### What is the difference between this repository and [Jimver/cuda-toolkit](https://github.com/Jimver/cuda-toolkit)?

[Jimver/cuda-toolkit](https://github.com/Jimver/cuda-toolkit) is a same Github Action for installing NVIDIA CUDA.
That action installs CUDA from hard-coded URLs, whereas this repository installs CUDA from dynamically generated URLs. Therefore, you can download the latest CUDA without waiting for the Action to be updated.
In addition, it supports specifying versions as `latest` or by major/minor version, and automatically selects between `network` and `local` installers.
Furthermore, this repository supports ARM64 architecture on Linux, which is not supported by [Jimver/cuda-toolkit](https://github.com/Jimver/cuda-toolkit).
