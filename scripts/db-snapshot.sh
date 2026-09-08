#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Local database snapshots
#
#  Captures and restores the exact contents of the local Postgres container —
#  every row, including data the seed does not know about.
#
#    ./scripts/db-snapshot.sh dump [name]      # write db-snapshots/<name>.sql
#    ./scripts/db-snapshot.sh restore [name]   # replace the database with it
#    ./scripts/db-snapshot.sh list
#
#  `name` defaults to "local". Snapshots live in db-snapshots/ and are ignored
#  by git — they contain password hashes and are specific to one machine.
#
#  When to use which:
#    - `npm run db:seed`  rebuilds the demo workspace from prisma/seed.ts. Use
#      this on a fresh database, or to get the demo back to a known state.
#    - `db-snapshot.sh`   preserves whatever happens to be there right now,
#      demo or not. Use it before something destructive.
#
#  Note: deleting the *container* does not lose data — the `postgres_data`
#  volume outlives it, so `docker compose up -d` brings the same database back.
#  Data is only lost by removing the volume (`docker compose down -v`).
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

CONTAINER="collboard-postgres"
DB_USER="collboard"
DB_NAME="collboard"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAP_DIR="$ROOT/db-snapshots"

CMD="${1:-}"
NAME="${2:-local}"
FILE="$SNAP_DIR/$NAME.sql"

die() { echo "error: $*" >&2; exit 1; }

require_container() {
  docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" \
    || die "container '$CONTAINER' is not running. Start it with: docker compose up -d"
}

case "$CMD" in
  dump)
    require_container
    mkdir -p "$SNAP_DIR"
    # --clean --if-exists so the restore can run over a populated database.
    docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
      --clean --if-exists --no-owner --no-privileges > "$FILE"
    echo "wrote $FILE ($(du -h "$FILE" | cut -f1))"
    ;;

  restore)
    require_container
    [ -f "$FILE" ] || die "no snapshot at $FILE. Run: ./scripts/db-snapshot.sh dump $NAME"
    echo "restoring $NAME into $DB_NAME — current contents will be replaced"
    docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q < "$FILE"
    echo "restored from $FILE"
    ;;

  list)
    if [ -d "$SNAP_DIR" ] && [ -n "$(ls -A "$SNAP_DIR" 2>/dev/null)" ]; then
      ls -lh "$SNAP_DIR"
    else
      echo "no snapshots yet — create one with: ./scripts/db-snapshot.sh dump"
    fi
    ;;

  *)
    sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
