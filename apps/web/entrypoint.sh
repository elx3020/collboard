#!/bin/sh
# Entrypoint that starts both the Next.js standalone server and the WS server.
# Forwards SIGTERM/SIGINT to both child processes for graceful shutdown.

set -e

# Start Next.js standalone server
node apps/web/server.js &
NEXT_PID=$!

# Start WebSocket server
node apps/web/ws-server.mjs &
WS_PID=$!

# Trap signals and forward to children
trap 'kill -TERM $NEXT_PID $WS_PID 2>/dev/null; wait $NEXT_PID $WS_PID 2>/dev/null' TERM INT

echo "Next.js PID=$NEXT_PID  |  WS server PID=$WS_PID"

# Wait for either process to exit
wait -n $NEXT_PID $WS_PID 2>/dev/null || true

# If one exits, shut down the other
kill -TERM $NEXT_PID $WS_PID 2>/dev/null || true
wait $NEXT_PID $WS_PID 2>/dev/null || true
