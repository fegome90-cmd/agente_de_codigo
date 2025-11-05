#!/bin/bash

# Wrapper script to run Python agents with virtual environment

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Activate virtual environment with explicit activation
source "$PROJECT_ROOT/.venv/bin/activate"

# Make sure tools are accessible
export PATH="/Users/felipe/miniconda3/bin:/opt/homebrew/bin:/Users/felipe/.npm-global/bin:$PATH"

# Execute the Python agent
exec python "$@"
