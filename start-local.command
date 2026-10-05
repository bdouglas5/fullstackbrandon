#!/bin/zsh
set -e
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null; then
  export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
fi
if ! command -v node >/dev/null; then
  print 'Install Node.js 22.13 or newer, then run this launcher again.'
  read
  exit 1
fi
if [[ ! -d node_modules ]]; then npm ci; fi
npm run dev &
GAME_PID=$!
trap 'kill $GAME_PID 2>/dev/null || true' EXIT INT TERM
for attempt in {1..40}; do
  if curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; then
    open http://localhost:3000
    break
  fi
  sleep .25
done
wait $GAME_PID
