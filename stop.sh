#!/usr/bin/env bash
# Stop app-insights-explorer (frontend :3000, backend :3001)

kill_port() {
  local port=$1
  local pid
  pid=$(powershell.exe -NoProfile -Command "
    \$c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (\$c) { \$c.OwningProcess }
  " 2>/dev/null | tr -d '\r\n')

  if [ -n "$pid" ]; then
    echo "Killing PID $pid on port $port"
    powershell.exe -NoProfile -Command "Stop-Process -Id $pid -Force"
  else
    echo "Nothing listening on port $port"
  fi
}

kill_port 3000
kill_port 3001
