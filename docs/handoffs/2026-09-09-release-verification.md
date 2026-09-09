# Application release verification

1. Agent 13: implement explicit demo-password-rotation exclusion and add the
   existing complete-route audit to protected production verification.
2. Agent 12: remediate the eight dependency advisories exposed by fresh CI on
   PR 47. Upgrade existing packages only; retain all security gates.
3. Agent 13: review the resulting lockfile, require patched-dependency CI and
   production build, then perform the authorized guarded release. Record live
   checks separately from local tests and unresolved provider/master-data setup.

The initial live read-only audit passed on revision 766492f6044e: 132 pages,
20 anonymous GET boundaries and all 11 supplied roles. It did not rotate any
password, post accounting data, or assert missing positive-record cases passed.

The independent dependency review is read-only. Root owns integration; no two
agents mutate the same files concurrently. Original-workspace documentation
changes and shared dependency junctions remain untouched.
