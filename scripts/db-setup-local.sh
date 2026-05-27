#!/usr/bin/env bash
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-$(whoami)}"
DB_NAME="openhive_experiment"
DB_USER="hive"
DB_PASS="hivepassword"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Setting up local Postgres for OpenHive experiment..."

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install Postgres first: brew install postgresql@16"
  exit 1
fi

if ! pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1; then
  echo "Postgres is not running. Start it with: brew services start postgresql@16"
  exit 1
fi

if ! psql -h "$PGHOST" -p "$PGPORT" -d postgres -tAc "SELECT 1 FROM pg_available_extensions WHERE name = 'vector'" | grep -q 1; then
  echo "pgvector is not installed for this Postgres version."
  echo "Build it from source against Postgres 16:"
  echo "  git clone --depth 1 --branch v0.8.2 https://github.com/pgvector/pgvector.git /tmp/pgvector-build"
  echo "  cd /tmp/pgvector-build && PG_CONFIG=\$(brew --prefix postgresql@16)/bin/pg_config make && make install"
  exit 1
fi

psql -h "$PGHOST" -p "$PGPORT" -d postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
EXCEPTION WHEN duplicate_object THEN NULL;
END \$\$;
SQL

psql -h "$PGHOST" -p "$PGPORT" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB_NAME};"
psql -h "$PGHOST" -p "$PGPORT" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
psql -h "$PGHOST" -p "$PGPORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -h "$PGHOST" -p "$PGPORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/src/db/schema.sql"
psql -h "$PGHOST" -p "$PGPORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
ALTER TABLE IF EXISTS hive_traces OWNER TO ${DB_USER};
ALTER TABLE IF EXISTS markov_transitions OWNER TO ${DB_USER};
ALTER TABLE IF EXISTS experiment_runs OWNER TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
SQL

echo "Done. Database ready at postgresql://${DB_USER}:${DB_PASS}@${PGHOST}:${PGPORT}/${DB_NAME}"
