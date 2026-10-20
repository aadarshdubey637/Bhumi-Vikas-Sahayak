#!/bin/sh
# Start-up sequence: migrate -> (optionally) load the rules -> exec the server.
#   SKIP_MIGRATIONS=1   skip 'alembic upgrade head'
#   INGEST_ON_START=1   load data/raw/*.jsonl + the amendment register into the database (idempotent: unchanged rules are skipped).
#                       Corpus/report outputs go to /tmp so a read-only or mounted ./data is never written.
set -eu
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  alembic upgrade head
fi
if [ "${INGEST_ON_START:-0}" = "1" ]; then
  python -m scripts.ingest_jsonl --load-db --corpus-out /tmp/corpus_rules.jsonl --report-out /tmp/ingestion_report.json
fi
exec "$@"
