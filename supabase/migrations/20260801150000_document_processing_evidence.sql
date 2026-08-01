-- Immutable, tenant-scoped CAD evidence per processing attempt.
-- Payload is the validated worker response. No signed URL, credential, or
-- tenant authority is persisted. NestJS remains the only ERP write authority.

do $$
begin
  create type public.document_processing_file_format as enum ('dxf', 'dwg');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.document_processing_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  job_id uuid not null,
  document_id uuid not null,
  project_id uuid not null,
  attempt integer not null,
  source_sha256 char(64) not null,
  producer_name varchar(100) not null,
  producer_version varchar(100) not null,
  source_format public.document_processing_file_format not null,
  parsed_format public.document_processing_file_format not null,
  item_count integer not null,
  warnings jsonb not null default '[]'::jsonb,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint document_processing_evidence_attempt_range
    check (attempt between 1 and 5),
  constraint document_processing_evidence_source_hash_hex
    check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint document_processing_evidence_producer_name_bounded
    check (length(btrim(producer_name)) between 1 and 100),
  constraint document_processing_evidence_producer_version_bounded
    check (length(btrim(producer_version)) between 1 and 100),
  constraint document_processing_evidence_item_count_range
    check (item_count between 0 and 5000),
  constraint document_processing_evidence_warnings_array
    check (
      jsonb_typeof(warnings) = 'array'
      and jsonb_array_length(warnings) <= 100
    ),
  constraint document_processing_evidence_payload_object
    check (
      jsonb_typeof(payload) = 'object'
      and payload->>'job_id' = job_id::text
      and payload->>'attempt' = attempt::text
      and payload->>'source_sha256' = source_sha256
    )
);

create unique index if not exists
  ux_document_processing_evidence_tenant_id_id
  on public.document_processing_evidence (tenant_id, id);

create unique index if not exists
  ux_document_processing_evidence_tenant_job_attempt
  on public.document_processing_evidence (tenant_id, job_id, attempt);

create index if not exists
  idx_document_processing_evidence_tenant_job
  on public.document_processing_evidence (tenant_id, job_id, attempt);

alter table public.document_processing_evidence
  drop constraint if exists document_processing_evidence_job_tenant_fk,
  drop constraint if exists document_processing_evidence_document_tenant_fk,
  drop constraint if exists document_processing_evidence_project_tenant_fk;

alter table public.document_processing_evidence
  add constraint document_processing_evidence_job_tenant_fk
    foreign key (tenant_id, job_id)
    references public.document_processing_jobs (tenant_id, id)
    on delete cascade
    not valid,
  add constraint document_processing_evidence_document_tenant_fk
    foreign key (tenant_id, document_id)
    references public.documents (tenant_id, id)
    on delete restrict
    not valid,
  add constraint document_processing_evidence_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id)
    on delete restrict
    not valid;

alter table public.document_processing_evidence
  validate constraint document_processing_evidence_job_tenant_fk,
  validate constraint document_processing_evidence_document_tenant_fk,
  validate constraint document_processing_evidence_project_tenant_fk;

alter table public.document_processing_evidence enable row level security;

revoke all privileges on table public.document_processing_evidence
  from public, anon, authenticated;

grant all privileges on table public.document_processing_evidence
  to service_role;
