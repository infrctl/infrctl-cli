#!/usr/bin/env sh
set -eu

repo="${INFRCTL_REPO:-infrctl/infrctl-cli}"
version="${INFRCTL_VERSION:-latest}"
if [ -n "${INFRCTL_INSTALL_DIR:-}" ]; then
  install_dir="$INFRCTL_INSTALL_DIR"
elif [ "$(id -u 2>/dev/null || printf '1')" = "0" ]; then
  install_dir="/usr/local/bin"
else
  install_dir="$HOME/.local/bin"
fi
tmp_dir=""
ollama_tmp_dir=""

say() {
  printf '%s\n' "$1"
}

fail() {
  say "Error: $1" >&2
  exit 1
}

cleanup() {
  if [ -n "$tmp_dir" ]; then
    rm -rf "$tmp_dir"
  fi

  if [ -n "$ollama_tmp_dir" ]; then
    rm -rf "$ollama_tmp_dir"
  fi
}

trap cleanup EXIT INT TERM

command_exists() {
  command -v "$1" >/dev/null 2>&1
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

  if command_exists curl; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if command_exists wget; then
    wget -qO "$output" "$url"
    return
  fi

  fail "curl or wget is required to download files."
}

verify_checksum() {
  archive="$1"
  checksum_file="$2"
  asset_name="$3"

  if [ "${INFRCTL_SKIP_CHECKSUM:-}" = "1" ]; then
    say "Skipping checksum verification because INFRCTL_SKIP_CHECKSUM=1."
    return
  fi

  if command_exists sha256sum; then
    (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$checksum_file")" >/dev/null)
    say "Checksum verified."
    return
  fi

  if command_exists shasum; then
    expected="$(awk '{print $1}' "$checksum_file")"
    actual="$(shasum -a 256 "$archive" | awk '{print $1}')"

    if [ "$expected" != "$actual" ]; then
      fail "Checksum verification failed for ${asset_name}."
    fi

    say "Checksum verified."
    return
  fi

  fail "sha256sum or shasum is required to verify ${asset_name}. Set INFRCTL_SKIP_CHECKSUM=1 to skip verification."
}

should_install_ollama() {
  if [ "${INFRCTL_SKIP_OLLAMA:-}" = "1" ]; then
    return 1
  fi

  if [ "${INFRCTL_INSTALL_OLLAMA:-1}" = "0" ]; then
    return 1
  fi

  return 0
}

install_ollama_if_missing() {
  if ! should_install_ollama; then
    say "Skipping Ollama install."
    return
  fi

  if command_exists ollama; then
    say "Ollama already installed."
    return
  fi

  case "$(uname -s)" in
    Linux|Darwin) ;;
    *)
      fail "Automatic Ollama install is supported on Linux and macOS. Install Ollama manually from https://ollama.com/download."
      ;;
  esac

  ollama_url="${INFRCTL_OLLAMA_INSTALL_URL:-https://ollama.com/install.sh}"

  if [ "${INFRCTL_DRY_RUN:-}" = "1" ]; then
    say "Dry run: install Ollama with ${ollama_url}"
    return
  fi

  say ""
  say "Ollama was not found. Installing Ollama from the official Ollama installer..."

  ollama_tmp_dir="$(mktemp -d)"
  ollama_script="$ollama_tmp_dir/ollama-install.sh"

  download "$ollama_url" "$ollama_script" || fail "Could not download Ollama installer from ${ollama_url}."
  sh "$ollama_script" || fail "Ollama installer failed."

  if command_exists ollama; then
    say "Ollama installed."
    return
  fi

  fail "Ollama installer finished, but the ollama command was not found. Open a new terminal or install Ollama from https://ollama.com/download."
}

install_with_npm() {
  package_version="${INFRCTL_NPM_VERSION:-latest}"
  target="infrctl@${package_version}"

  command_exists node || fail "Node.js was not found. Install Node.js 18+ first: https://nodejs.org/"
  command_exists npm || fail "npm was not found. Install npm with Node.js 18+ first: https://nodejs.org/"

  node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf '0')"

  if [ "$node_major" -lt 18 ]; then
    fail "Node.js 18+ is required. Current version: $(node --version)"
  fi

  say "Installing ${target} with npm..."

  if [ "${INFRCTL_DRY_RUN:-}" = "1" ]; then
    say "Dry run: npm install -g ${target}"
    return
  fi

  npm install -g "$target"
}

if [ "${INFRCTL_INSTALL_METHOD:-binary}" = "npm" ]; then
  install_with_npm
  install_ollama_if_missing
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
  say "Dry run: verify ${url}.sha256"
  say "Dry run: install to ${install_dir}/infrctl"
  install_ollama_if_missing
  exit 0
fi

tmp_dir="$(mktemp -d)"

archive="$tmp_dir/$asset"
checksum_file="$tmp_dir/$asset.sha256"
download "$url" "$archive" || {
  if [ "${INFRCTL_ALLOW_NPM_FALLBACK:-}" = "1" ]; then
    say "Binary download failed. Falling back to npm..."
    install_with_npm
    install_ollama_if_missing
    exit 0
  fi

  fail "Could not download ${url}. Set INFRCTL_ALLOW_NPM_FALLBACK=1 to fall back to npm."
}

download "$url.sha256" "$checksum_file" || fail "Could not download checksum ${url}.sha256."
verify_checksum "$archive" "$checksum_file" "$asset"

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

install_ollama_if_missing

"$install_dir/infrctl" --version
