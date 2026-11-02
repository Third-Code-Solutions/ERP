# ADR-044 — Server-owned application table writes

Status: accepted for the requested independent-installation security remediation,
2026-10-12. No hosted change is authorized by this document.

## Evidence and decision

Independent source review found no production browser or user-session Supabase
table mutation caller. Application writes use capability-checked Core commands or
audited Web server actions. Service-role Edge schedulers remain trusted writers.
Nevertheless, the local catalog exposed authenticated mutation grants on 103
public tables and TRUNCATE on 37. Rolled-back Viewer probes minted a BOM portal
token, enabled provider delivery and queued an outbox entry without the server
capability checks. No external job or provider was invoked.

Revoke non-read table and column privileges from PUBLIC, anon and authenticated
for application tables in public. Preserve existing SELECT privileges exactly,
RLS, trusted server grants, Auth/Storage schemas and Realtime. Remove corresponding
public-schema defaults for migration/table-owner roles and prevent the CI parity
fixture from restoring client writes. Existing explicit function grants remain:
invitation activation is a reviewed SECURITY DEFINER RPC and requires no caller
table-write privilege; users reads, owner checks and Auth APIs stay supported.

This is a write-authority correction, not certification of every role-level read
policy. A hosted installation must identify any external consumers relying on
direct Data API mutations before deploying this change and migrate them to
authorized server commands. No such consumer was found in repository callers.

## Verification and recovery

Assert effective table/column/default privileges, representative Viewer write
denials and tenant-isolated reads. Run invitation activation, service-role jobs,
server financial workflows and migration replay. Do not obtain a green suite by
restoring client-write grants. Tests of client mutation capabilities now assert
denial; actual command authorization is exercised through server workflows.

Recover forward with corrected server commands. Do not reopen the demonstrated
bypasses as an application rollback. Existing rows, audit entries and historical
financial snapshots are unchanged.
