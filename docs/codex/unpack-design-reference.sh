#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
archive="${TMPDIR:-/tmp}/senvo-storefront-design-reference.zip"
output_dir="${TMPDIR:-/tmp}/senvo-storefront-design-reference"
expected_sha256="0913eb7d986acfa943efb48cd9e2ee1ed960811dcacd365a956ef3ecc7595183"

cat "${repo_root}"/docs/codex/senvo-storefront-design-reference.zip.b64-part-* \
  | base64 --decode > "${archive}"

actual_sha256="$(sha256sum "${archive}" | awk '{print $1}')"
if [[ "${actual_sha256}" != "${expected_sha256}" ]]; then
  echo "Design reference checksum mismatch." >&2
  exit 1
fi

mkdir -p "${output_dir}"
unzip -q -o "${archive}" -d "${output_dir}"
echo "Design reference ready at ${output_dir}/reference"
