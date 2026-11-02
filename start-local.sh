#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
NODE_ENV=development HOST=127.0.0.1 PORT="${PORT:-3000}" npm start
