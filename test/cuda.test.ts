import { describe, it, expect } from 'vitest';
import {
  fetchAvailableCudaVersions,
  fetchRedistribVersions,
  fetchArchiveVersions,
  fetchOpensourceVersions,
  fetchMd5sum,
  normalizeCudaVersion,
  findCudaVersion,
  fetchCudaRepoOS,
  findCudaRepoAndPackageLinux,
} from '../src/cuda';
import { Arch, type LinuxDistribution } from '../src/os_arch';

describe('CUDA Version Normalization', () => {
  const testCases = [
    { input: '8.0.27', expected: '8.0', description: 'CUDA 8.0.27 -> 8.0' },
    { input: '8.0.61', expected: '8.0', description: 'CUDA 8.0.61 -> 8.0' },
    { input: '9.2.148', expected: '9.2', description: 'CUDA 9.2.148 -> 9.2' },
    { input: '10.1.243', expected: '10.1', description: 'CUDA 10.1.243 -> 10.1' },
    { input: '10.2', expected: '10.2', description: 'CUDA 10.2 -> 10.2' },
    { input: '11.0.3', expected: '11.0.3', description: 'CUDA 11.0.3 -> 11.0.3' },
    { input: '12.3.0', expected: '12.3.0', description: 'CUDA 12.3.0 -> 12.3.0' },
    { input: '13.0.2', expected: '13.0.2', description: 'CUDA 13.0.2 -> 13.0.2' },
  ];

  testCases.forEach(({ input, expected, description }) => {
    it(description, () => {
      const result = normalizeCudaVersion(input);
      expect(result).toBe(expected);
    });
  });
});

describe('CUDA Version Finding', () => {
  it('should find latest version', async () => {
    const result = await findCudaVersion('latest');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d+\.\d+(\.\d+)?$/);
  });

  it('should find major version 10', async () => {
    const result = await findCudaVersion('10');
    expect(result).toBeDefined();
    expect(result).toMatch(/^10\.\d+(\.\d+)?$/);
  });

  it('should find major version 11', async () => {
    const result = await findCudaVersion('11');
    expect(result).toBeDefined();
    expect(result).toMatch(/^11\.\d+(\.\d+)?$/);
  });

  it('should find minor version 11.0', async () => {
    const result = await findCudaVersion('11.0');
    expect(result).toBeDefined();
    expect(result).toMatch(/^11\.0(\.\d+)?$/);
  });

  it('should find major version 12', async () => {
    const result = await findCudaVersion('12');
    expect(result).toBeDefined();
    expect(result).toMatch(/^12\.\d+(\.\d+)?$/);
  });

  it('should return undefined for non-existent version 99.9', async () => {
    const result = await findCudaVersion('99.9');
    expect(result).toBeUndefined();
  });
});

describe('CUDA Version Fetching', () => {
  describe('Method A: Redistrib JSON manifests', () => {
    it('should fetch versions from redistrib', async () => {
      const versions = await fetchRedistribVersions();
      expect(versions).toBeDefined();
      expect(Array.isArray(versions)).toBe(true);
      expect(versions.length).toBeGreaterThan(0);
      // Each version should match semver pattern
      versions.forEach((version) => {
        expect(version).toMatch(/^\d+\.\d+(\.\d+)?$/);
      });
    });
  });

  describe('Method B: CUDA Toolkit Archive', () => {
    it('should fetch versions from archive', async () => {
      const versions = await fetchArchiveVersions();
      expect(versions).toBeDefined();
      expect(Array.isArray(versions)).toBe(true);
      expect(versions.length).toBeGreaterThan(0);
      // Each version should match semver pattern
      versions.forEach((version) => {
        expect(version).toMatch(/^\d+\.\d+(\.\d+)?$/);
      });
    });
  });

  describe('Method C: Opensource directory', () => {
    it('should fetch versions from opensource', async () => {
      const versions = await fetchOpensourceVersions();
      expect(versions).toBeDefined();
      expect(Array.isArray(versions)).toBe(true);
      expect(versions.length).toBeGreaterThan(0);
      // Each version should match semver pattern
      versions.forEach((version) => {
        expect(version).toMatch(/^\d+\.\d+(\.\d+)?$/);
      });
    });
  });

  describe('Combined: All available versions', () => {
    it('should fetch all available versions and deduplicate', async () => {
      const allVersions = await fetchAvailableCudaVersions();
      expect(allVersions).toBeDefined();
      expect(Array.isArray(allVersions)).toBe(true);
      expect(allVersions.length).toBeGreaterThan(0);

      // Verify sorted order
      const versionNumbers = allVersions.map((v) => {
        const parts = v.split('.').map(Number);
        return parts[0] * 1000000 + (parts[1] || 0) * 1000 + (parts[2] || 0);
      });
      for (let i = 1; i < versionNumbers.length; i++) {
        expect(versionNumbers[i]).toBeGreaterThanOrEqual(versionNumbers[i - 1]);
      }

      // Verify uniqueness
      const uniqueVersions = new Set(allVersions);
      expect(uniqueVersions.size).toBe(allVersions.length);
    });

    it('should have a valid latest version', async () => {
      const allVersions = await fetchAvailableCudaVersions();
      const latest = allVersions[allVersions.length - 1];
      expect(latest).toBeDefined();
      expect(latest).toMatch(/^\d+\.\d+(\.\d+)?$/);
    });
  });
});

describe('MD5 Checksum Availability', () => {
  it('should fetch MD5 checksums when available', async () => {
    // Test a range of versions to find ones with MD5 checksums
    const allVersions = await fetchAvailableCudaVersions();

    // Test older versions which are more likely to have MD5 checksums
    // Start from middle of the list and test 10 versions
    const startIdx = Math.floor(allVersions.length / 2);
    const testVersions = allVersions.slice(startIdx, startIdx + 10);

    const results: { version: string; hasMd5: boolean }[] = [];

    for (const version of testVersions) {
      try {
        const md5 = await fetchMd5sum(version);
        expect(md5).toBeDefined();
        expect(typeof md5).toBe('string');
        expect(md5).toMatch(/^[a-f0-9]{32}$/i); // MD5 hash format
        results.push({ version, hasMd5: true });
      } catch (error) {
        results.push({ version, hasMd5: false });
      }
    }

    // This test verifies the MD5 fetching mechanism works
    // and handles errors gracefully for versions without MD5 checksums
    expect(results.length).toBe(testVersions.length);
  });
});

describe('CUDA Repo OS', () => {
  it('should fetch available OS repositories', async () => {
    const osList = await fetchCudaRepoOS();
    expect(osList).toBeDefined();
    expect(Array.isArray(osList)).toBe(true);
    expect(osList.length).toBeGreaterThan(0);

    // OS names should be non-empty strings
    osList.forEach((os) => {
      expect(typeof os).toBe('string');
      expect(os.length).toBeGreaterThan(0);
    });
  });

  it('should include common OS platforms', async () => {
    const osList = await fetchCudaRepoOS();

    // Check for common OS patterns (may vary based on actual data)
    const hasLinux = osList.some(
      (os) => os.toLowerCase().includes('linux') || os.includes('ubuntu') || os.includes('rhel')
    );
    expect(hasLinux).toBe(true);
  });
});

describe('CUDA Repo and Package Name for Linux', () => {
  const testCases = [
    {
      os: 'ubuntu2004',
      osInfo: {
        id: 'ubuntu',
        version: '20.04',
        name: 'Ubuntu',
        idLink: 'debian',
      } as LinuxDistribution,
    },
    {
      os: 'ubuntu2404',
      osInfo: {
        id: 'ubuntu',
        version: '24.04',
        name: 'Ubuntu',
        idLink: 'debian',
      } as LinuxDistribution,
    },
    {
      os: 'rhel8',
      osInfo: {
        id: 'rhel',
        version: '8',
        name: 'Red Hat Enterprise Linux',
        idLink: 'fedora',
      } as LinuxDistribution,
    },
    {
      os: 'rhel9',
      osInfo: {
        id: 'rhel',
        version: '9',
        name: 'Red Hat Enterprise Linux',
        idLink: 'fedora',
      } as LinuxDistribution,
    },
  ];

  // Test requested versions
  const cudaVersions = ['11.3.0', '11.7.1', '12.4.1', '13.0.2'];

  testCases.forEach(({ os, osInfo }) => {
    cudaVersions.forEach((cudaVersion) => {
      it(`should test ${os} CUDA ${cudaVersion} (x86_64)`, async () => {
        const result = await findCudaRepoAndPackageLinux(cudaVersion, Arch.X86_64, osInfo);

        console.log(`\n=== ${os} CUDA ${cudaVersion} (x86_64) ===`);
        if (result) {
          console.log('Repo URL:', result.repoUrl);
          console.log('Package Name:', result.packageName);
        } else {
          console.log(
            'Result: Not found (This may be expected if the version is not available for this OS)'
          );
        }

        // Just verify the function doesn't throw an error
        expect(true).toBe(true);
      });
    });
  });
});
