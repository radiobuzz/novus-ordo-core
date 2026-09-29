#!/bin/bash
# Linux test harness: private socket/database and public files, never application credentials.
set -euo pipefail
cd "$(dirname "$0")/../.."
case "${1:-lifecycle}" in
 lifecycle) production_suite=production-lifecycle; production_browser=production-lifecycle-browser ;;
 state) production_suite=production-state; production_browser='' ;;
 policies) production_suite=policy-foundation; production_browser=policy-http ;;
 resources) production_suite=resource-foundation; production_browser=resource-browser ;;
 *) echo 'Usage: bash tests/client/run-production-checks.sh [lifecycle|state|policies|resources] [--browser]' >&2; exit 2 ;;
esac
if [ -n "${2:-}" ] && [ "$2" != --browser ]; then exit 2; fi
production_test_root=$(mktemp -d /tmp/no7-entry-db-XXXXXXXX)
export NO7_ENTRY_TEST_ROOT="$production_test_root"
echo "$production_suite: $production_test_root"
mariadb-install-db --datadir="$production_test_root/data" --auth-root-authentication-method=normal --skip-test-db > "$production_test_root/install.log" 2>&1
mariadbd --no-defaults --datadir="$production_test_root/data" --socket="$production_test_root/mysql.sock" --pid-file="$production_test_root/mysql.pid" --skip-networking --log-error="$production_test_root/mysql.log" &
production_db_pid=$!
production_http_pid=''
trap 'if [ -n "$production_http_pid" ]; then kill "$production_http_pid" 2>/dev/null || true; wait "$production_http_pid" 2>/dev/null || true; fi; kill "$production_db_pid" 2>/dev/null || true; wait "$production_db_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 100); do
 if mariadb --no-defaults --socket="$production_test_root/mysql.sock" -uroot -e 'SELECT 1' >/dev/null 2>&1; then break; fi
 sleep .1
done
mariadb --no-defaults --socket="$production_test_root/mysql.sock" -uroot -e 'CREATE DATABASE no7_entry_test'
php8.3 "tests/client/$production_suite.php"
if [ "$production_suite" = resource-foundation ]; then
 php8.3 tests/client/resource-accounting.php
 php8.3 tests/client/resource-grants.php
fi
if [ "${2:-}" = --browser ] && [ -n "$production_browser" ]; then
 production_router=tests/client/entry-server.php
 if [ "$production_suite" = policy-foundation ]; then production_router=tests/client/map-beta-server.php; fi
 php8.3 -S 127.0.0.1:8792 "$production_router" > "$production_test_root/http.log" 2>&1 &
 production_http_pid=$!
 node "tests/client/$production_browser.mjs"
fi
