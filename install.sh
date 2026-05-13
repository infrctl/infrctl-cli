#!/usr/bin/env sh
set -eu

repo="${INFRCTL_REPO:-infrctl/infrctl-cli}"
version="${INFRCTL_VERSION:-latest}"
install_dir="${INFRCTL_INSTALL_DIR:-$HOME/.local/bin}"

say() {
  printf '%s\n' "$1"
}

fail() {
  say "Error: $1" >&2
  exit 1
}

if [ "${INFRCTL_DEBUG:-}" = "1" ]; then
  set -x
fi

detect_platform() {
  case "$(uname -s)" in
    Linux) printf 'linux' ;;
    Darwin) printf 'darwin' ;;
    *)
      fail "Unsupported OS: $(uname -s). Use npm install -g infrctl or download a release asset manually."
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'x64' ;;
    arm64|aarch64) printf 'arm64' ;;
    *)
      fail "Unsupported architecture: $(uname -m)"
      ;;
  esac
}

download() {
  url="$1"
  output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
    return
  fi

  fail "curl or wget is required to download infrctl."
}

install_with_npm() {
  package_version="${INFRCTL_NPM_VERSION:-latest}"
  target="infrctl@${package_version}"

  command -v node >/dev/null 2>&1 || fail "Node.js was not found. Install Node.js 18+ first: https://nodejs.org/"
  command -v npm >/dev/null 2>&1 || fail "npm was not found. Install npm with Node.js 18+ first: https://nodejs.org/"

  node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf '0')"

  if [ "$node_major" -lt 18 ]; then
    fail "Node.js 18+ is required. Current version: $(node --version)"
  fi

  say "Installing ${target} with npm..."

  if [ "${INFRCTL_DRY_RUN:-}" = "1" ]; then
    say "Dry run: npm install -g ${target}"
    exit 0
  fi

  npm install -g "$target"
}

if [ "${INFRCTL_INSTALL_METHOD:-binary}" = "npm" ]; then
  install_with_npm
  exit 0
fi

platform="$(detect_platform)"
arch="$(detect_arch)"
asset="infrctl-${platform}-${arch}.tar.gz"

if [ "$version" = "latest" ]; then
  url="https://github.com/${repo}/releases/latest/download/${asset}"
else
  case "$version" in
    v*) tag="$version" ;;
    *) tag="v$version" ;;
  esac
  url="https://github.com/${repo}/releases/download/${tag}/${asset}"
fi

say "Installing infrctl ${version} for ${platform}-${arch}..."

if [ "${INFRCTL_DRY_RUN:-}" = "1" ]; then
  say "Dry run: download ${url}"
  say "Dry run: install to ${install_dir}/infrctl"
  exit 0
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT INT TERM

archive="$tmp_dir/$asset"
download "$url" "$archive" || {
  if [ "${INFRCTL_ALLOW_NPM_FALLBACK:-}" = "1" ]; then
    say "Binary download failed. Falling back to npm..."
    install_with_npm
    exit 0
  fi

  fail "Could not download ${url}. Set INFRCTL_ALLOW_NPM_FALLBACK=1 to fall back to npm."
}

mkdir -p "$install_dir"
tar -xzf "$archive" -C "$tmp_dir"
install -m 755 "$tmp_dir/infrctl" "$install_dir/infrctl"

say ""
say "infrctl installed to ${install_dir}/infrctl"

case ":$PATH:" in
  *":$install_dir:"*) ;;
  *)
    say ""
    say "Add this directory to PATH if needed:"
    say "  export PATH=\"$install_dir:\$PATH\""
    ;;
esac

"$install_dir/infrctl" --version
