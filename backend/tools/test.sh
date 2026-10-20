#!/usr/bin/env bash
# Runs the suite. Uses the interpreter's own pytest when present; otherwise the standalone pytest
# with the system site-packages (pydantic) on PYTHONPATH. Run from backend/.
set -euo pipefail
cd "$(dirname "$0")/.."
if python3 -c "import pytest" 2>/dev/null; then exec python3 -m pytest -q "$@"; fi
SITE="$(python3 -c 'import pydantic,os;print(os.path.dirname(os.path.dirname(pydantic.__file__)))')"
PYTHONPATH="$SITE" exec pytest -q "$@"
