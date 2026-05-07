Find and fix the bug in src/dashboard-state-large.tsx where changing the dashboard search term or filters can leave the user on an empty or stale pagination page.

Expected behavior: changing search, segment, or region must reset pageIndex to 0. Page navigation itself should still respect the requested page.

Make the smallest safe code change in src/dashboard-state-large.tsx, then briefly explain what you changed. No test run is required; do not search dependency directories or test directories.
