#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
UP="$ROOT_DIR/scripts/dev_up.sh"
CHECK="$ROOT_DIR/scripts/e2e_check.py"

if ! command -v python3 >/dev/null 2>&1; then echo "python3 no encontrado" >&2; exit 2; fi

echo "Levantando servicios si no están activos..."
"$UP"

echo "Ejecutando verificación end-to-end..."
python3 "$CHECK"
