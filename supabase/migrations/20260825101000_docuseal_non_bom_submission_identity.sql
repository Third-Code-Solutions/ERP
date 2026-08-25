-- A provider submission ID identifies exactly one signable source within each
-- non-BOM table. Cross-table ambiguity is still rejected in Core.

begin;

create unique index if not exists ux_variation_orders_docuseal_submission_id
  on public.variation_orders (docuseal_submission_id)
  where docuseal_submission_id is not null;

create unique index if not exists ux_certificates_of_completion_docuseal_submission_id
  on public.certificates_of_completion (docuseal_submission_id)
  where docuseal_submission_id is not null;

commit;

-- Rollback: drop the two additive indexes only after disabling non-BOM
-- DocuSeal template initiation and confirming no callback remains in flight.
