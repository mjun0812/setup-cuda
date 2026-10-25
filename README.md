# setup-cuda

[![Release](https://shieldcn.dev/github/mjun0812/setup-cuda/release.svg)](https://github.com/mjun0812/setup-cuda/releases)
[![License](https://shieldcn.dev/github/mjun0812/setup-cuda/license.svg)](https://github.com/mjun0812/setup-cuda)
[![Marketplace](https://shieldcn.dev/badge/Marketplace-Setup_CUDA-blue.svg)](https://github.com/marketplace/actions/mjun0812-setup-cuda)  
[![GitHub Sponsors](https://shieldcn.dev/badge/Sponsor-mjun0812-pink.svg?logo=githubsponsors)](https://github.com/sponsors/mjun0812)
[![Buy Me A Coffee](https://shieldcn.dev/badge/Buy_Me_A_Coffee-mjun0812-yellow.svg?logo=buymeacoffee)](https://buymeacoffee.com/mjun0812)

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
      version: '13.0'
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
  - name: Setup CUDA 13.0
    uses: mjun0812/setup-cuda@v1
    with:
      version: '13.0'
```

### Install a specific patch version

```yaml
steps:
  - name: Setup CUDA 13.0.1
    uses: mjun0812/setup-cuda@v1
    with:
      version: '13.0.1'
```

### Specify installation method

```yaml
steps:
  - name: Setup CUDA with network installer
    uses: mjun0812/setup-cuda@v1
    with:
      version: '13.0'
      method: 'network' # or 'local', 'auto'
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
        version: '13.0'
```

## Inputs

### `version`

**Description**: The version of NVIDIA CUDA to install (supports versions > 10.0).

**Format**:

- `latest`: Install the latest available version
- `Major` (e.g., `13`): Install the latest minor version for the specified major version
- `Major.Minor` (e.g., `13.0`): Install the latest patch version for the specified major.minor version
- `Major.Minor.Patch` (e.g., `13.0.1`): Install the exact version specified

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

### `cache-installer`

**Description**: Whether to cache the downloaded CUDA installer file (the Linux runfile, the Windows local installer, or the Windows network installer) in the [GitHub Actions cache](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching).

- When a cache entry exists, the installer is restored from the cache instead of being downloaded
- Otherwise, the installer is downloaded and saved to the cache after a successful installation
- The cache key is `setup-cuda-installer-<os>-<arch>-<installer file name>`
- Has no effect for the Linux network installation (apt / dnf), which downloads no installer file
- The local installers are several GB (about 4 GB for CUDA 13.4) and count against the default `10 GB` per-repository cache limit, so caching them can evict your other caches

**Required**: No
**Default**: `false`

### `cache-toolkit`

**Description**: Whether to cache the installed CUDA toolkit directory in the [GitHub Actions cache](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching).

- When a cache entry exists, the toolkit is restored from the cache, and nothing is downloaded or installed
- Otherwise, CUDA is installed as usual and the toolkit directory is saved to the cache after a successful installation
- The cache holds only the toolkit directory: `/usr/local/cuda-<major>.<minor>` on Linux (`/usr/local/cuda` is linked to it after a restore) and `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v<major>.<minor>` on Windows. Anything the installer puts elsewhere (registry entries, Nsight tools, machine-level environment variables) is not restored
- On Windows, the CUDA Visual Studio integration (`extras\visual_studio_integration\MSBuildExtensions`) is copied into every Visual Studio installation found by `vswhere` after a restore
- The cache key is `setup-cuda-toolkit-linux-<arch>-<distribution id>-<distribution version>-<CUDA version>-<method>` on Linux and `setup-cuda-toolkit-windows-<arch>-<CUDA version>-<method>` on Windows
- A toolkit is several GB and counts against the default `10 GB` per-repository cache limit, so caching it can evict your other caches

**Required**: No
**Default**: `false`

**Example**:

```yaml
- name: Setup CUDA
  uses: mjun0812/setup-cuda@v1
  with:
    version: '13.0'
    cache-toolkit: true
```

## Outputs

### `version`

The full version string of NVIDIA CUDA that was actually installed (e.g., `13.0.1`).

**Example**:

```yaml
- name: Setup CUDA
  id: cuda
  uses: mjun0812/setup-cuda@v1
  with:
    version: '13.0'

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
- `CUDA_PATH_V<major>_<minor>` (e.g., `CUDA_PATH_V13_0`): Path to the CUDA installation directory, used by the CUDA Visual Studio integration (MSBuild) to find the toolkit

## Troubleshooting

### CUDA installation fails with network method

If the network installer fails, the action will automatically fall back to the local installer when using `method: auto`. You can also explicitly specify `method: local`.

```yaml
- name: Setup CUDA with local installer
  uses: mjun0812/setup-cuda@v1
  with:
    version: '13.0'
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
