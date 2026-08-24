create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.tenants (
  id uuid primary key,
  name varchar(255) not null,
  slug varchar(100) not null unique,
  organization_type varchar(64) not null default 'other',
  pcab_license varchar(50),
  bir_tin varchar(20),
  dpo_contact varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email varchar(255) not null,
  full_name varchar(255) not null,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.projects (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  account_id uuid,
  name varchar(255) not null,
  client varchar(255) not null,
  project_code varchar(40),
  location text,
  status text not null,
  project_type text,
  total_sqm integer,
  notes text,
  created_by uuid references public.users (id),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.documents (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  opportunity_id uuid,
  uploaded_by uuid references public.users (id) on delete set null,
  document_type text not null,
  file_name varchar(255) not null,
  storage_path text not null,
  mime_type varchar(127) not null,
  size_bytes bigint not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
