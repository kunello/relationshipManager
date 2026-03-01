#!/usr/bin/env bash
set -euo pipefail

# Copy shared/ modules into gcp/functions-mcp/src/shared/ for deployment.
# The MCP server deploys as a standalone Docker image and cannot reference
# files outside its own directory, so we copy shared code at build time.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC="$PROJECT_ROOT/shared"
DEST="$PROJECT_ROOT/gcp/functions-mcp/src/shared"

if [ ! -d "$SRC" ]; then
  echo "ERROR: shared/ directory not found at $SRC"
  exit 1
fi

rm -rf "$DEST"
cp -r "$SRC" "$DEST"
echo "Copied shared/ → gcp/functions-mcp/src/shared/"
