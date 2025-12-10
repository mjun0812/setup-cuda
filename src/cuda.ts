import { HttpClient } from '@actions/http-client';
import { OS, Arch, LinuxDistribution, isDebianBased, isFedoraBased } from './os_arch';
import { sortVersions, compareVersions, debugLog } from './utils';
import { CUDA_LINKS, START_SUPPORTED_CUDA_VERSION, OLD_CUDA_VERSIONS } from './const';

/**
 * Normalize CUDA version for old
 * For major version <= 10, returns only major.minor (e.g., "8.0", "10.2")
 * For major version >= 11, returns the full version (e.g., "11.0.3", "12.3.0")
 * @param version - Version string to normalize
 * @returns Normalized version string
 */
export function normalizeCudaVersion(version: string): string {
  const parts = version.split('.');
  const major = parseInt(parts[0], 10);

  if (major <= 10) {
    // For CUDA 10 and below, only major.minor is available in opensource directory
    return parts.slice(0, 2).join('.');
  }

  // For CUDA 11 and above, full version is available
  return version;
}

/**
 * Get the URL for the download file for a given CUDA version
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param dir - The directory containing the download file
 * @param filename - The name of the download file
 * @returns The URL for the download file
 */
export function getDownloadUrl(version: string, dir: string, filename: string): string {
  return `https://developer.download.nvidia.com/compute/cuda/${version}/${dir}/${filename}`;
}

/**
 * Get the URL for the MD5 checksum file for a given CUDA version
 * @param version - CUDA version string (e.g., "12.3.0")
 * @returns The URL for the MD5 checksum file
 */
export function getMd5sumUrl(version: string): string {
  const major_version: number = parseInt(version.split('.')[0]);
  if (major_version >= 11) {
    return `https://developer.download.nvidia.com/compute/cuda/${version}/docs/sidebar/md5sum.txt`;
  } else {
    return CUDA_LINKS[version].md5sumUrl;
  }
}

/**
 * Fetch and parse MD5 checksum data for a given CUDA version
 * @param version - CUDA version string (e.g., "12.3.0")
 * @returns Promise that resolves to the MD5 checksum text content
 * @throws Error if the download fails or the response is not ok
 */
export async function fetchMd5sum(version: string): Promise<Record<string, string>> {
  const client = new HttpClient('setup-cuda');
  const url = getMd5sumUrl(version);

  const response = await client.get(url);

  if (response.message.statusCode !== 200) {
    throw new Error(
      `Failed to fetch MD5 checksum from ${url}. Please check the version and try again: ${response.message.statusCode} ${response.message.statusMessage}`
    );
  }

  const text = await response.readBody();

  const md5sums: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const [md5sum, filename] = line.split(' ');
    md5sums[filename] = md5sum;
  }
  return md5sums;
}

/**
 * Fetch available CUDA versions from redistrib JSON manifests (Method A)
 * @returns Promise that resolves to an array of version strings
 */
export async function fetchRedistribVersions(): Promise<string[]> {
  const client = new HttpClient('setup-cuda');
  const url = 'https://developer.download.nvidia.com/compute/cuda/redist/';

  const response = await client.get(url);

  if (response.message.statusCode !== 200) {
    throw new Error(
      `Failed to fetch redistrib index from ${url}: ${response.message.statusCode} ${response.message.statusMessage}`
    );
  }

  const html = await response.readBody();

  // Extract redistrib_*.json filenames
  const redistribPattern = /redistrib_([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)\.json/g;
  const versions = new Set<string>();

  let match;
  while ((match = redistribPattern.exec(html)) !== null) {
    versions.add(match[1]);
  }

  return sortVersions([...versions]);
}

/**
 * Fetch available CUDA versions from CUDA Toolkit Archive page (Method B)
 * @returns Promise that resolves to an array of version strings
 */
export async function fetchArchiveVersions(): Promise<string[]> {
  const client = new HttpClient('setup-cuda');
  const url = 'https://developer.nvidia.com/cuda-toolkit-archive';

  const response = await client.get(url);

  if (response.message.statusCode !== 200) {
    throw new Error(
      `Failed to fetch archive page from ${url}: ${response.message.statusCode} ${response.message.statusMessage}`
    );
  }

  const html = await response.readBody();

  const versions = new Set<string>();

  // Pattern 1: "CUDA Toolkit X.Y.Z" or "CUDA Toolkit X.Y"
  const pattern1 = /CUDA Toolkit\s+(\d+\.\d+(?:\.\d+)?)/gi;
  let match;
  while ((match = pattern1.exec(html)) !== null) {
    versions.add(match[1]);
  }

  // Pattern 2: Links with version numbers in href
  const pattern2 = /cuda-(\d+)-(\d+)(?:-(\d+))?-/g;
  while ((match = pattern2.exec(html)) !== null) {
    const version = match[3] ? `${match[1]}.${match[2]}.${match[3]}` : `${match[1]}.${match[2]}`;
    versions.add(version);
  }

  return sortVersions([...versions]);
}

/**
 * Fetch available CUDA versions from opensource directory (Method C)
 * Note: For CUDA 10 and below, only major.minor versions are available (e.g., "8.0", "10.2")
 * For CUDA 11 and above, full versions are available (e.g., "11.0.3", "12.3.0")
 * @returns Promise that resolves to an array of version strings
 */
export async function fetchOpensourceVersions(): Promise<string[]> {
  const client = new HttpClient('setup-cuda');
  const url = 'https://developer.download.nvidia.com/compute/cuda/opensource/';

  const response = await client.get(url);

  if (response.message.statusCode !== 200) {
    throw new Error(
      `Failed to fetch opensource index from ${url}: ${response.message.statusCode} ${response.message.statusMessage}`
    );
  }

  const html = await response.readBody();

  // Extract version directory names
  const versionPattern = />([0-9]+\.[0-9]+(?:\.[0-9]+)?)\//g;
  const versions = new Set<string>();

  let match;
  while ((match = versionPattern.exec(html)) !== null) {
    const normalizedVersion = normalizeCudaVersion(match[1]);
    versions.add(normalizedVersion);
  }

  return sortVersions([...versions]);
}

/**
 * Fetch all available CUDA versions by combining Method A, B, and C
 * Even if some sources fail, this function will return versions from successful sources
 * @returns Promise that resolves to an array of unique version strings, sorted
 */
export async function fetchAvailableCudaVersions(): Promise<string[]> {
  // Use Promise.allSettled to handle individual failures gracefully
  const results = await Promise.allSettled([
    fetchRedistribVersions(),
    fetchArchiveVersions(),
    fetchOpensourceVersions(),
  ]);

  // Extract successful results
  const redistribVersions = results[0].status === 'fulfilled' ? results[0].value : [];
  const archiveVersions = results[1].status === 'fulfilled' ? results[1].value : [];
  const opensourceVersions = results[2].status === 'fulfilled' ? results[2].value : [];

  // Combine and deduplicate versions
  const allVersions = new Set([
    ...redistribVersions,
    ...archiveVersions,
    ...opensourceVersions,
    ...OLD_CUDA_VERSIONS,
  ]);

  let versions = sortVersions([...allVersions]);

  // Filter versions to only include START_SUPPORTED_CUDA_VERSION and later
  versions = versions.filter(
    (version) => compareVersions(version, START_SUPPORTED_CUDA_VERSION) >= 0
  );

  return versions;
}

/**
 * Find a matching CUDA version from the available versions list
 * @param inputVersion - Version string to match (e.g., "latest", "11", "11.2", "11.2.0")
 * @returns Promise that resolves to matched version string, or undefined if not found
 *
 * @example
 * await findCudaVersion('latest') // Returns the latest available version
 * await findCudaVersion('10') // Returns the latest 10.x version
 * await findCudaVersion('11.0') // Returns the latest 11.0.x version
 * await findCudaVersion('11.0.1') // Returns '11.0.1' if available
 */
export async function findCudaVersion(inputVersion: string): Promise<string | undefined> {
  // Fetch available versions
  const versions = await fetchAvailableCudaVersions();

  // Case 1: "latest" returns the newest version
  if (inputVersion === 'latest') {
    return versions[versions.length - 1];
  }

  // Case 2: Exact match
  if (versions.includes(inputVersion)) {
    return inputVersion;
  }

  // Case 3: Prefix match (e.g., "10" matches "10.x", "11.2" matches "11.2.x")
  // Find all versions that start with the input followed by a dot
  const prefix = inputVersion + '.';
  const matchingVersions = versions.filter((v) => v.startsWith(prefix));
  if (matchingVersions.length > 0) {
    // Return the latest matching version
    return matchingVersions[matchingVersions.length - 1];
  }

  // Case 4: No match found
  return undefined;
}

/**
 * Get the URL for the CUDA installer for a given version, OS, and architecture
 * @param version - CUDA version string (e.g., "12.3.0")
 * @param os - Operating system (e.g., OS.LINUX, OS.WINDOWS)
 * @param arch - Architecture (e.g., Arch.X86_64, Arch.ARM64_SBSA)
 * @returns The URL for the CUDA installer
 */
export async function getCudaLocalInstallerUrl(
  version: string,
  os: OS,
  arch: Arch
): Promise<string> {
  // Check if the version is supported
  if (compareVersions(version, START_SUPPORTED_CUDA_VERSION) < 0) {
    throw new Error(`CUDA version ${version} is not supported`);
  }
  const majorVersion = parseInt(version.split('.')[0]);
  if (majorVersion <= 10 && os === OS.LINUX && arch === Arch.ARM64_SBSA) {
    throw new Error(
      `CUDA version ${version} is not supported on Linux with Arm architecture for CUDA 10 and earlier`
    );
  }

  // If the version is in CUDA_LINKS, use the corresponding URL
  if (version in CUDA_LINKS) {
    const link = CUDA_LINKS[version];
    if (os === OS.LINUX && arch === Arch.X86_64 && link.linuxX86Url) {
      return link.linuxX86Url;
    }
    if (os === OS.LINUX && arch === Arch.ARM64_SBSA && link.linuxArm64Url) {
      return link.linuxArm64Url;
    }
    if (os === OS.WINDOWS && link.windowsLocalInstallerUrl) {
      return link.windowsLocalInstallerUrl;
    }
  }

  // For CUDA 10 and earlier, only Linux X86_64 and Windows are supported
  // These versions' installer URLs are different from the later versions.
  if (majorVersion <= 10 && os === OS.LINUX && arch === Arch.X86_64) {
    return CUDA_LINKS[version].linuxX86Url;
  } else if (majorVersion <= 10 && os === OS.WINDOWS) {
    return CUDA_LINKS[version].windowsLocalInstallerUrl;
  }

  // For CUDA 11 and later, the installer URLs are the same pattern for all architectures
  const md5sums = await fetchMd5sum(version);
  let targetFilename: string | undefined = undefined;
  if (os === OS.LINUX) {
    // Linux X86_64: cuda_<version>_<bundle driver version>_linux.run
    // Linux ARM64_SBSA: cuda_<version>_<bundle driver version>_linux_sbsa.run
    let pattern: RegExp;
    if (arch === Arch.X86_64) {
      pattern = new RegExp(
        `cuda_${version.replace(/\./g, '\\.')}_\\d+\\.\\d+(\\.\\d+)?_linux\\.run`
      );
    } else if (arch === Arch.ARM64_SBSA) {
      pattern = new RegExp(
        `cuda_${version.replace(/\./g, '\\.')}_\\d+\\.\\d+(\\.\\d+)?_linux_sbsa\\.run`
      );
    } else {
      throw new Error(`Unsupported architecture: ${arch}`);
    }

    for (const [filename] of Object.entries(md5sums)) {
      const match = filename.match(pattern);
      if (match) {
        targetFilename = filename;
        break;
      }
    }
  } else if (os === OS.WINDOWS) {
    // Windows: Prefer _windows.exe, fallback to _win10.exe
    let windowsFilename: string | undefined;
    let win10Filename: string | undefined;

    for (const [filename] of Object.entries(md5sums)) {
      if (filename.endsWith('_windows.exe')) {
        windowsFilename = filename;
        break; // Prefer _windows.exe, so break immediately
      } else if (filename.endsWith('_win10.exe')) {
        win10Filename = filename;
      }
    }

    targetFilename = windowsFilename || win10Filename;
  }
  if (!targetFilename) {
    throw new Error(
      `No matching CUDA installer found for version ${version} on ${os} with architecture ${arch}`
    );
  }
  return getDownloadUrl(version, 'local_installers', targetFilename);
}

/**
 * Generic function to fetch items from CUDA repository pages
 * @param url - The URL to fetch from
 * @param pattern - Regular expression pattern to extract items (must have a capture group)
 * @param filterFn - Optional filter function to exclude certain items
 * @param sort - Whether to sort the results (default: false)
 * @returns Promise that resolves to an array of extracted items
 */
async function fetchCudaRepoItems(
  url: string,
  pattern: RegExp,
  filterFn?: (item: string) => boolean,
  sort: boolean = false
): Promise<string[]> {
  const client = new HttpClient('setup-cuda');
  const response = await client.get(url);

  if (response.message.statusCode !== 200) {
    throw new Error(
      `Failed to fetch from ${url}: ${response.message.statusCode} ${response.message.statusMessage}`
    );
  }
  const html = await response.readBody();

  const items = new Set<string>();
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const item = match[1];
    if (!filterFn || filterFn(item)) {
      items.add(item);
    }
  }

  const result = [...items];
  return sort ? result.sort() : result;
}

/**
 * Fetch available OS repositories from CUDA repos directory
 * @returns Promise that resolves to an array of OS directory names
 */
export async function fetchCudaRepoOS(): Promise<string[]> {
  const url = 'https://developer.download.nvidia.com/compute/cuda/repos/';
  // Extract OS directory names (e.g., ubuntu2204/, rhel9/, etc.)
  const dirPattern = />([a-zA-Z0-9_\-]+)\//g;
  // Filter out common non-OS directories like "Parent Directory"
  const filterFn = (dirName: string) => dirName !== '..';

  return fetchCudaRepoItems(url, dirPattern, filterFn, true);
}

/**
 * Fetch available files from a CUDA repository directory
 * @param url - The repository URL to fetch files from
 * @returns Promise that resolves to an array of file names
 */
async function fetchCudaRepoFiles(url: string): Promise<string[]> {
  // Extract filenames from <a href="..."> or <a href='...'> tags
  const linkPattern = /<a\s+href=['"]([^'"]+)['"]/gi;
  // Skip parent directory (..) and directories (ending with /)
  const filterFn = (href: string) => href !== '../' && !href.endsWith('/');

  return fetchCudaRepoItems(url, linkPattern, filterFn, false);
}

/**
 * Find the URL for the CUDA Windows network installer for a given version
 * @param version - CUDA version string (e.g., "12.3.0")
 * @returns The URL for the CUDA Windows network installer, or undefined if not found
 */
export async function findCudaNetworkInstallerWindows(
  version: string
): Promise<string | undefined> {
  if (version in CUDA_LINKS && CUDA_LINKS[version].windowsNetworkInstallerUrl) {
    return CUDA_LINKS[version].windowsNetworkInstallerUrl;
  }

  // https://developer.download.nvidia.com/compute/cuda/
  //   <CUDA_VERSION>/local_installers/cuda_<CUDA_VERSION>_<DRIVER_VERSION>_<OS>.exe
  // to
  // https://developer.download.nvidia.com/compute/cuda/
  //   <CUDA_VERSION>/network_installers/cuda_<CUDA_VERSION>_<OS>_network.exe
  let url = await getCudaLocalInstallerUrl(version, OS.WINDOWS, Arch.X86_64);
  url = url.replace(
    /local_installers\/cuda_([^_]+)_[^_]+_(.+)\.exe/,
    'network_installers/cuda_$1_$2_network.exe'
  );
  debugLog(`CUDA Windows network installer URL: ${url}`);

  // Verify that the network installer exists
  const client = new HttpClient('setup-cuda');
  try {
    const response = await client.head(url);
    if (response.message.statusCode === 200) {
      return url;
    }
  } catch {
    // If HEAD request fails, the installer doesn't exist
    console.error(`CUDA Windows network installer not found for version ${version}`);
    return undefined;
  }

  return undefined;
}

/**
 * Build the target OS name for CUDA repository
 * Different distributions use different version formats:
 * - Ubuntu: major.minor -> ubuntu2204 (both major and minor, remove dots)
 * - RHEL: major.minor -> rhel9 (major only)
 * - Debian: major.minor -> debian12 (major only)
 * - Fedora: single number -> fedora40
 * @param osInfo - Linux distribution information
 * @returns Target OS name string (e.g., "ubuntu2204", "rhel9")
 */
function buildTargetOsName(osInfo: LinuxDistribution): string {
  const id = osInfo.id.toLowerCase();
  const version = osInfo.version;

  let versionPart: string;
  if (id === 'ubuntu') {
    // Ubuntu uses major.minor format, remove dots
    versionPart = version.replace(/\./g, '');
  } else {
    // Most other distros use major version only
    versionPart = version.split('.')[0];
  }

  return `${id}${versionPart}`;
}

/**
 * Build the CUDA repository URL for the given target OS and architecture
 * @param targetOsName - Target OS name (e.g., "ubuntu2204")
 * @param arch - Architecture type
 * @returns CUDA repository URL
 * @throws Error if architecture is not supported
 */
function buildCudaRepoUrl(targetOsName: string, arch: Arch): string {
  let cudaRepoUrl = `https://developer.download.nvidia.com/compute/cuda/repos/${targetOsName}`;

  if (arch === Arch.X86_64) {
    cudaRepoUrl += '/x86_64/';
  } else if (arch === Arch.ARM64_SBSA) {
    cudaRepoUrl += '/sbsa/';
  } else {
    throw new Error(`Unsupported architecture: ${arch}`);
  }

  return cudaRepoUrl;
}

/**
 * Find the CUDA repository configuration filename from available files
 * Debian-based: cuda-keyring*.deb or cuda-*.pin
 * Fedora-based: cuda-*.repo
 * @param repoFiles - Array of available repository files
 * @param osInfo - Linux distribution information
 * @returns Repository filename
 * @throws Error if no repository file is found
 */
function findRepoFilename(repoFiles: string[], osInfo: LinuxDistribution): string {
  if (isDebianBased(osInfo)) {
    // Debian: cuda-keyring_<version>-<build>_all.deb
    const cudaKeyringPattern = /cuda-keyring_[\w.-]+\.deb/gi;
    const cudaKeyringMatches = repoFiles.filter((file) => cudaKeyringPattern.test(file)).sort();
    if (cudaKeyringMatches.length > 0) {
      return cudaKeyringMatches[cudaKeyringMatches.length - 1];
    }

    // Old Debian CUDA Repositories: cuda-*.pin
    const cudaPinPattern = /cuda-[\w.-]+\.pin/i;
    const cudaPinMatches = repoFiles.filter((file) => cudaPinPattern.test(file)).sort();
    if (cudaPinMatches.length > 0) {
      return cudaPinMatches[cudaPinMatches.length - 1];
    }
  } else if (isFedoraBased(osInfo)) {
    // Fedora: cuda-<os><version>.repo
    const cudaRepoPattern = /cuda-[\w.-]+\.repo/i;
    const cudaRepoMatches = repoFiles.filter((file) => cudaRepoPattern.test(file)).sort();
    if (cudaRepoMatches.length > 0) {
      return cudaRepoMatches[cudaRepoMatches.length - 1];
    }
  }

  throw new Error(`CUDA repository file not found`);
}

/**
 * Find available CUDA packages from repository files
 * @param repoFiles - Array of available repository files
 * @param cudaVersion - CUDA version string
 * @param osInfo - Linux distribution information
 * @returns Array of available package filenames
 * @throws Error if no packages are found
 */
function findAvailablePackages(
  repoFiles: string[],
  cudaVersion: string,
  osInfo: LinuxDistribution
): string[] {
  let availablePackages: string[] = [];

  if (isDebianBased(osInfo)) {
    availablePackages = repoFiles
      .filter(
        (file) =>
          file.startsWith(`cuda-toolkit_${cudaVersion}`) || file.startsWith(`cuda_${cudaVersion}`)
      )
      .sort();
  } else if (isFedoraBased(osInfo)) {
    availablePackages = repoFiles
      .filter(
        (file) =>
          file.startsWith(`cuda-toolkit-${cudaVersion}`) || file.startsWith(`cuda-${cudaVersion}`)
      )
      .sort();
  }

  if (availablePackages.length === 0) {
    throw new Error(`No available packages found for ${cudaVersion} on ${osInfo.id}`);
  }

  return availablePackages;
}

/**
 * Extract package name from the package filename
 * Debian: <package>_<version>_<arch>.deb -> <package>=<version>
 * Fedora: <package>-<version>-<release>.<arch>.rpm -> <package>-<version>-<release>
 * @param packageFile - Package filename
 * @param osInfo - Linux distribution information
 * @returns Formatted package name for installation
 */
function extractPackageName(packageFile: string, osInfo: LinuxDistribution): string {
  if (isDebianBased(osInfo)) {
    // debian: cuda-toolkit_<version> or cuda_<version>
    // filename format: <package>_<version>_<arch>.deb
    const match = packageFile.match(/^([^_]+)_([^_]+)_.*\.deb$/);
    if (match) {
      return `${match[1]}=${match[2]}`;
    }
    return packageFile;
  } else if (isFedoraBased(osInfo)) {
    // fedora: cuda-toolkit-<version> or cuda-<version>
    // filename format: <package>-<version>-<release>.<arch>.rpm
    // dnf install <package>-<version>-<release>
    const match = packageFile.match(/^(.+)-(\d+\.\d+\.\d+)-(\d+)\..+\.rpm$/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    return packageFile;
  }

  return packageFile;
}

/**
 * Find if a CUDA repository exists for the given OS configuration
 * @param cudaVersion - CUDA version string (e.g., "12.3.0")
 * @param arch - Architecture type
 * @param osInfo - Linux distribution information
 * @returns Promise that resolves to true if the OS repository exists, false otherwise
 */
export async function findCudaRepoAndPackageLinux(
  cudaVersion: string,
  arch: Arch,
  osInfo: LinuxDistribution
): Promise<{ repoUrl: string; packageName: string } | undefined> {
  // Verify that the OS is supported
  const osList = await fetchCudaRepoOS();
  const targetOsName = buildTargetOsName(osInfo);
  if (!osList.includes(targetOsName)) {
    throw new Error(`CUDA repository for ${targetOsName} not found`);
  }

  // Build repository URL and fetch available files
  const cudaRepoUrl = buildCudaRepoUrl(targetOsName, arch);
  const repoFiles = await fetchCudaRepoFiles(cudaRepoUrl);

  // Find repository configuration file
  const filename = findRepoFilename(repoFiles, osInfo);

  // Find available CUDA packages
  const availablePackages = findAvailablePackages(repoFiles, cudaVersion, osInfo);

  // Extract package name from the first (Debian) or last (Fedora) package
  const selectedPackage = isDebianBased(osInfo)
    ? availablePackages[0]
    : availablePackages[availablePackages.length - 1];
  const packageName = extractPackageName(selectedPackage, osInfo);

  return { repoUrl: `${cudaRepoUrl}${filename}`, packageName: packageName };
}
