-- Preserve tenant identity when retaining project-comment creation evidence.
-- PostgreSQL's composite SET NULL action otherwise nulls every referencing
-- column, including tenant_id, which is intentionally NOT NULL.

alter table public.project_comment_create_requests
  drop constraint if exists project_comment_create_requests_comment_tenant_fk;

alter table public.project_comment_delete_requests
  drop constraint if exists project_comment_delete_requests_comment_tenant_fk;

alter table public.project_comment_create_requests
  add constraint project_comment_create_requests_comment_tenant_fk
    foreign key (tenant_id, comment_id)
    references public.project_comments (tenant_id, id)
    on delete set null (comment_id)
    not valid;

alter table public.project_comment_create_requests
  validate constraint project_comment_create_requests_comment_tenant_fk;

alter table public.project_comment_delete_requests
  add constraint project_comment_delete_requests_comment_tenant_fk
    foreign key (tenant_id, comment_id)
    references public.project_comments (tenant_id, id)
    on delete set null (comment_id)
    not valid;

alter table public.project_comment_delete_requests
  validate constraint project_comment_delete_requests_comment_tenant_fk;
