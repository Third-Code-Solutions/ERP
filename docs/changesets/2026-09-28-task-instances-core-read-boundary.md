# Task instance Core read boundary

- Added a forward migration that removes the broad `authenticated` table `SELECT` grant and `task_instances_tenant_read` policy. `anon` and `PUBLIC` remain without direct read access. `service_role` retains `SELECT` for server-owned Core workflows. No task rows or other data are changed.
- Reviewed direct consumers: Core process endpoints, server-side dashboard/SLA jobs, award actions, and the shared award operation use Drizzle rather than the Supabase Data API. Core must continue to apply tenant and capability filters before returning task rows.
- Added a rollback-only database test that applies the migration in a transaction, proves direct reads fail for authenticated users from two tenants and `anon`, and proves tenant-filtered `service_role` reads remain available.

## Rollback and release note

If the migration must be reverted, restore the previous tenant read policy and grant in a separate reviewed migration:

```sql
create policy task_instances_tenant_read on public.task_instances
  for select to authenticated
  using (tenant_id = public.auth_tenant_id());
grant select on table public.task_instances to authenticated;
```

This restores tenant-wide Data API visibility, including tasks outside a user's business unit. Prefer repairing Core's server connection or task endpoint before applying that security regression. Validate the migration against the exact release database and deploy it with the Core route change; the local test does not prove hosted provider state.
