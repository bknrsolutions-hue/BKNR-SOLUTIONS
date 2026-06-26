#!/bin/bash
set -e

PORT="${PORT:-10000}"
exec gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  --workers 1 \
  --bind "0.0.0.0:${PORT}" \
  --timeout 120 \
  --graceful-timeout 30 \
  --access-logfile - \
  --error-logfile -
