#!/usr/bin/env bash
# DB test svite (RLS izolacija + correct_trip_event lanac) protiv LINKED (DEV) baze.
# Mehanizam: impersonacija (set_config jwt claims + set role authenticated) u jednoj
# transakciji koja se ROLLBACK-uje (sentinel raise) → strogo read-only.
#
# NIJE deo `npm test`/CI (CI nema bazu ni supabase login). Pokreni ručno protiv DEV-a:
#   npm run test:db      (zahteva `supabase link` na BrumTruckerz-dev)
set -uo pipefail
cd "$(dirname "$0")/../.."
fail=0
run() {
  local file="$1" sentinel="$2" out
  out="$(supabase db query --linked -f "$file" 2>&1)"
  if echo "$out" | grep -q "$sentinel"; then
    echo "PASS  $file"
  else
    echo "FAIL  $file"
    echo "$out" | grep -oE 'FAIL:[^"\\]*' | head -1
    fail=1
  fi
}
run supabase/tests/rls_audit_test.sql           ALL_RLS_TESTS_PASSED
run supabase/tests/correct_event_chain_test.sql ALL_CHAIN_TESTS_PASSED
run supabase/tests/identity_test.sql            ALL_IDENTITY_TESTS_PASSED
run supabase/tests/invitations_test.sql         ALL_INVITATIONS_TESTS_PASSED
run supabase/tests/dispatcher_test.sql           ALL_DISPATCHER_TESTS_PASSED
[ "$fail" -eq 0 ] && echo "DB tests: ALL PASSED" || echo "DB tests: FAILURES ABOVE"
exit $fail
