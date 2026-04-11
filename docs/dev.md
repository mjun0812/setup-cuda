# Development Guide

## Prerequisites

- Node.js >= 24.0.0
- pnpm (version specified in package.json: 10.18.3)

## Setup

Install dependencies:

```bash
pnpm install
```

## Development Workflow

### 1. Create a Feature Branch

Always work on a feature branch, not directly on `main`:

```bash
git checkout -b <your-branch-name>
```

Branch naming convention (recommended):

- `feat/<feature-name>` - for new features
- `fix/<bug-name>` - for bug fixes
- `docs/<doc-name>` - for documentation
- `refactor/<refactor-name>` - for refactoring

### 2. Make Changes

After making code changes, run the following commands locally:

```bash
# Format code
pnpm run format

# Lint
pnpm run lint:fix

# Type check
pnpm run typecheck

# Run tests
pnpm run test

# Build
pnpm run build

# Or run all at once
pnpm run all
```

**Important**: Always commit the `dist/` directory after building. The built files must be committed because GitHub Actions runs the action from the repository directly.

### 3. Commit Changes

Follow Conventional Commits format:

```bash
git add .
git commit -m "feat: add new feature"
```

Commit message format:

- `feat:` - new feature
- `fix:` - bug fix
- `docs:` - documentation changes
- `refactor:` - code refactoring
- `test:` - test changes
- `ci:` - CI/CD changes

### 4. Push and Create PR

```bash
git push origin <your-branch-name>
```

Then create a PR on GitHub targeting the `main` branch.

## CI/CD

### CI Workflow (`.github/workflows/ci.yml`)

Runs on:

- Pull requests to `main`
- Pushes to `main`

Jobs:

1. **Format-Lint-TypeCheck**
   - Checks code formatting with Prettier
   - Lints code with ESLint
   - Type checks with TypeScript
   - Runs unit tests with Vitest

2. **Test**
   - Tests the action on multiple platforms:
     - Windows: windows-latest
     - Linux: ubuntu-latest, ubuntu-24.04-arm
   - Tests with different installation methods: local, network, auto
   - Tests with latest CUDA version

3. **ci-check**
   - Final status check that ensures all jobs passed

### Full Test Workflow (`.github/workflows/full-test.yml`)

Runs on:

- Manual trigger (workflow_dispatch)
- Weekly schedule (Sunday at 3 AM UTC)

Comprehensive testing matrix:

- OS: windows-latest, windows-2025, windows-2022, ubuntu-latest, ubuntu-24.04, ubuntu-22.04, ubuntu-24.04-arm, ubuntu-22.04-arm
- CUDA versions: 10.0, 11.0, 12.0, 13.0, latest
- Methods: local, auto

### Container Test Workflow (`.github/workflows/container-test.yml`)

Runs on:

- Manual trigger (workflow_dispatch)

Tests on container environments:

- almalinux:9
- fedora:latest
- quay.io/pypa/manylinux_2_28_x86_64

## Release Process

### 1. Ensure `dist/` is Up-to-Date

Before creating a release, make sure the `dist/` directory is built and committed:

```bash
pnpm run build
git add dist/
git commit -m "build: update dist for release"
git push
```

### 2. Create and Push a Tag

Tags must follow the format `v<major>.<minor>.<patch>` (Semantic Versioning):

```bash
git tag v1.2.3
git push origin v1.2.3
```

### 3. Release Workflow Triggers

When a tag matching `v[0-9]+.[0-9]+.[0-9]+` is pushed, the release workflow (`.github/workflows/release.yml`) automatically:

1. Checks out the code
2. Installs dependencies
3. Builds the project
4. Verifies that `dist/` is up-to-date (fails if uncommitted changes exist)
5. Creates a GitHub release with auto-generated release notes
6. Updates the major version tag (e.g., `v1`) to point to the new release

Example:

- Push `v1.2.3` → Creates release and updates `v1` tag to point to `v1.2.3`
- This allows users to reference `mjun0812/setup-cuda@v1` to always get the latest v1.x.x

## Testing Locally

### Unit Tests

```bash
# Run tests once
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage
```

### Integration Test

To test the action locally, you can create a test workflow in `.github/workflows/` and trigger it manually, or use [act](https://github.com/nektos/act) to run GitHub Actions locally.

## Project Structure

```
.
├── src/              # TypeScript source code
├── dist/             # Compiled JavaScript (must be committed)
├── .github/
│   └── workflows/    # CI/CD workflows
├── docs/             # Documentation
├── package.json      # Project metadata and scripts
├── action.yml        # GitHub Action definition
└── tsconfig.json     # TypeScript configuration
```

## Notes

- The `dist/` directory must always be committed after changes
- The release workflow will fail if `dist/` is not up-to-date
- Major version tags (e.g., `v1`) are automatically updated on release
- CI runs automatically on all PRs to ensure code quality
