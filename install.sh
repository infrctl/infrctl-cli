#!/usr/bin/env sh
set -eu

package_name="${INFRCTL_PACKAGE:-infrctl}"
package_version="${INFRCTL_VERSION:-latest}"
target="${package_name}@${package_version}"

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

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js was not found. Install Node.js 18+ first: https://nodejs.org/"
fi

if ! command -v npm >/dev/null 2>&1; then
  fail "npm was not found. Install npm with Node.js 18+ first: https://nodejs.org/"
fi

node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf '0')"

if [ "$node_major" -lt 18 ]; then
  fail "Node.js 18+ is required. Current version: $(node --version)"
fi

say "Installing ${target} with npm..."

if [ "${INFRCTL_DRY_RUN:-}" = "1" ]; then
  say "Dry run: npm install -g ${target}"
  exit 0
fi

if ! npm install -g "$target"; then
  cat >&2 <<'EOF'

Install failed.

If this is a permissions issue, prefer fixing your npm global prefix or using
a Node version manager instead of running this script with sudo.
EOF
  exit 1
fi

say ""
say "infrctl installed."

if command -v infrctl >/dev/null 2>&1; then
  infrctl --version
else
  say "The infrctl binary was installed, but it is not on PATH yet."
  say "Check your npm global bin directory and restart your terminal."
fi
