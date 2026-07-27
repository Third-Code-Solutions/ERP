-- pgcrypto's digest() lives in the `extensions` schema on Supabase; include it.
create or replace function cortex_provenance_append(
  p_tenant uuid, p_subject_kind cortex_subject_kind, p_subject_id uuid,
  p_origin cortex_provenance_origin, p_origin_ref text, p_actor uuid
) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_prev text; v_hash text; v_id bigint;
begin
  select hash into v_prev from cortex_provenance where tenant_id = p_tenant order by id desc limit 1;
  if v_prev is null then v_prev := 'genesis'; end if;
  v_hash := encode(
    digest(
      v_prev || p_subject_kind::text || coalesce(p_subject_id::text, '')
             || p_origin::text || coalesce(p_origin_ref, '') || clock_timestamp()::text,
      'sha256'
    ), 'hex'
  );
  insert into cortex_provenance(tenant_id, subject_kind, subject_id, origin, origin_ref, actor_id, prev_hash, hash)
  values (p_tenant, p_subject_kind, p_subject_id, p_origin, p_origin_ref, p_actor, v_prev, v_hash)
  returning id into v_id;
  return v_id;
end $$;;
