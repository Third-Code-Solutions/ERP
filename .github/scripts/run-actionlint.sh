#!/usr/bin/env bash
set -euo pipefail

readonly ACTIONLINT_VERSION="1.7.12"
readonly ACTIONLINT_SHA256="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
readonly REPOSITORY_ROOT="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../.."
  pwd -P
)"
readonly TEMP_DIRECTORY="$(mktemp -d)"
readonly ARCHIVE="actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz"

cleanup() {
  rm -rf -- "$TEMP_DIRECTORY"
}
trap cleanup EXIT

cd "$TEMP_DIRECTORY"
curl --fail --show-error --silent --location \
  --proto '=https' \
  --tlsv1.2 \
  --output "$ARCHIVE" \
  "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/${ARCHIVE}"
printf '%s  %s\n' "$ACTIONLINT_SHA256" "$ARCHIVE" | sha256sum --check -
tar --extract --gzip --file "$ARCHIVE" actionlint

if (($# == 0)); then
  set -- "$REPOSITORY_ROOT"/.github/workflows/*.yml
fi

"$TEMP_DIRECTORY/actionlint" -color "$@"
