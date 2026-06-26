#!/bin/zsh
set -euo pipefail

ROOT_DIR="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT_DIR"

echo "Xcode Cloud: installing JavaScript dependencies"
if ! command -v npm >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "error: npm is required before resolving Capacitor Swift packages."
    exit 1
  fi
  echo "Xcode Cloud: npm not found; installing Node.js with Homebrew"
  brew install node
fi

export CAPACITOR_ENV=production

npm ci

echo "Xcode Cloud: syncing Capacitor iOS project"
npx cap sync ios
