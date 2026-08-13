#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" || -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL and RESTORE_DATABASE_URL are required." >&2
  exit 2
fi

drill_dir="$(mktemp -d)"
backup_file="${drill_dir}/slabx.dump"
trap 'rm -rf "${drill_dir}"' EXIT

pg_dump --format=custom --no-owner --no-privileges --dbname="${DATABASE_URL}" --file="${backup_file}"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="${RESTORE_DATABASE_URL}" "${backup_file}"

source_count="$(psql "${DATABASE_URL}" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
restore_count="$(psql "${RESTORE_DATABASE_URL}" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"

if [[ "${source_count}" != "${restore_count}" ]]; then
  echo "Restore verification failed: migration counts differ." >&2
  exit 1
fi

echo "Backup and restore drill passed with ${restore_count} applied migrations."
