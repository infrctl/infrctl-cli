# infrctl Release Checklist

Use this before publishing a public npm release.

Repository:

```text
https://github.com/infrctl/infrctl-cli.git
```

## Local Checks

```bash
cd infrctl
npm ci
npm run check
npm run audit:prod
npm run build:binary
./dist-bin/infrctl-$(node -p "process.platform + '-' + process.arch")/infrctl --version
```

## Manual Smoke Tests

```bash
infrctl --version
infrctl doctor
infrctl status
infrctl -p "What is the exact name of this CLI? Answer with only the name."
infrctl serve phi --auto-port
curl http://127.0.0.1:8787/health
```

If port `8787` is busy, use the port printed by `--auto-port`.

## Cross-Platform Matrix

Run at least the non-Ollama checks on:

- Linux
- macOS
- Windows PowerShell

Run Ollama smoke tests on at least Linux or macOS before publishing.

## Publish

Confirm the package name is still available:

```bash
npm view infrctl name version
```

An `E404` means the name is currently available.

Publish:

```bash
npm login
npm publish
```

After publishing:

```bash
npm install -g infrctl
infrctl --version
```

Check the curl installer:

```bash
curl -fsSL https://raw.githubusercontent.com/infrctl/infrctl-cli/main/install.sh | INFRCTL_DRY_RUN=1 sh
curl -fsSL https://raw.githubusercontent.com/infrctl/infrctl-cli/main/install.sh | INFRCTL_DRY_RUN=1 INFRCTL_SKIP_OLLAMA=1 sh
```

## Binary Release

Tag a release to build and upload standalone binaries:

```bash
git tag v0.1.2
git push origin v0.1.2
```

The release workflow uploads:

- `infrctl-linux-x64.tar.gz`
- `infrctl-linux-arm64.tar.gz`
- `infrctl-darwin-x64.tar.gz`
- `infrctl-darwin-arm64.tar.gz`
- `infrctl-win32-x64.tar.gz`

After the release finishes:

```bash
curl -fsSL https://raw.githubusercontent.com/infrctl/infrctl-cli/main/install.sh | sh
infrctl --version
```
