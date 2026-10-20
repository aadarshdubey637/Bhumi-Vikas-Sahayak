#!/usr/bin/env bash
# Usage (from project root): bash backend/tools/backup.sh 001_initial_audit
set -euo pipefail
name="${1:?label required, e.g. 001_initial_audit}"
mkdir -p backups
out="backups/project_backup_${name}.zip"
rm -f "$out"
zip -q -r "$out" backend PROJECT_PROGRESS.md TASK_TRACKER.csv SESSION_HANDOFF.md RESUME_INSTRUCTIONS.md \
  -x '*/__pycache__/*' '*.pyc' '*/.venv/*' '*/node_modules/*' '*/.pytest_cache/*' '*/.ruff_cache/*' '*.env' '.env*'
cp "$out" backups/project_recovery_latest.zip
unzip -tq "$out"
echo "created $out ($(du -h "$out" | cut -f1))"
