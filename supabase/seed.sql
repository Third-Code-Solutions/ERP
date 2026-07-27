-- Deterministic, secret-free baseline for local resets and database CI.
--
-- This is deliberately small: database-backed tests create their own
-- transaction-scoped fixtures. The fixed tenant/project below only supports
-- read-only Cortex retrieval checks that require at least one canonical node.

begin;

insert into public.tenants (
  id,
  name,
  slug,
  created_at,
  updated_at
)
values (
  '2b2b039c-b066-412b-af4c-564f2af6097e',
  'Third Code ERP Local',
  'third-code-erp-local',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
)
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  updated_at = excluded.updated_at;

insert into public.users (
  id,
  tenant_id,
  email,
  full_name,
  role,
  created_at,
  updated_at
)
values (
  '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
  '2b2b039c-b066-412b-af4c-564f2af6097e',
  'local-admin@thirdcode.invalid',
  'Local Database Admin',
  'admin',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
)
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  updated_at = excluded.updated_at;

insert into public.projects (
  id,
  tenant_id,
  name,
  client,
  status,
  created_by,
  created_at,
  updated_at
)
values (
  'a6778017-a3d3-4ba5-8989-3127d75b458b',
  '2b2b039c-b066-412b-af4c-564f2af6097e',
  'Local Verification Project',
  'Third Code ERP',
  'active',
  '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
)
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  name = excluded.name,
  client = excluded.client,
  status = excluded.status,
  created_by = excluded.created_by,
  updated_at = excluded.updated_at;

insert into public.fiscal_periods (
  id,
  tenant_id,
  name,
  starts_on,
  ends_on,
  status,
  created_by,
  created_at,
  updated_at
)
values (
  'b5c069e8-7837-4ab6-8d3c-d7fe84b09b56',
  '2b2b039c-b066-412b-af4c-564f2af6097e',
  'FY 2026',
  '2026-01-01',
  '2026-12-31',
  'open',
  '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
)
on conflict (tenant_id, name) do update
set
  starts_on = excluded.starts_on,
  ends_on = excluded.ends_on,
  updated_at = excluded.updated_at;

insert into public.ledger_accounts (
  id,
  tenant_id,
  code,
  name,
  account_type,
  normal_balance,
  system_key,
  created_by,
  created_at,
  updated_at
)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '1000',
    'Cash and cash equivalents',
    'asset',
    'debit',
    'cash',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-00000000000e',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '1010',
    'Operating bank',
    'asset',
    'debit',
    null,
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '1100',
    'Accounts receivable',
    'asset',
    'debit',
    'accounts_receivable',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000009',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '1110',
    'Retention receivable',
    'asset',
    'debit',
    'retention_receivable',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-00000000000a',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '1120',
    'Withholding tax receivable',
    'asset',
    'debit',
    'withholding_tax_receivable',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-00000000000c',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '1130',
    'Input VAT receivable',
    'asset',
    'debit',
    'input_vat_receivable',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '1200',
    'Inventory',
    'asset',
    'debit',
    'inventory',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000004',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '2000',
    'Accounts payable',
    'liability',
    'credit',
    'accounts_payable',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-00000000000f',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '2010',
    'Goods received, not invoiced',
    'liability',
    'credit',
    'goods_received_not_invoiced',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-00000000000b',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '2100',
    'Output VAT payable',
    'liability',
    'credit',
    'output_vat_payable',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-00000000000d',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '2110',
    'Withholding tax payable',
    'liability',
    'credit',
    'withholding_tax_payable',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000005',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '3000',
    'Owner equity',
    'equity',
    'credit',
    'equity',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000006',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '4000',
    'Revenue',
    'income',
    'credit',
    'revenue',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000007',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '5000',
    'Cost of sales',
    'expense',
    'debit',
    'cost_of_sales',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000008',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '6000',
    'Operating expenses',
    'expense',
    'debit',
    'operating_expense',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000010',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '5100',
    'Inventory consumption',
    'expense',
    'debit',
    'inventory_consumption',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000011',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '4200',
    'Inventory adjustment gain',
    'income',
    'credit',
    'inventory_adjustment_gain',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'a0000000-0000-4000-8000-000000000012',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    '6100',
    'Inventory adjustment loss',
    'expense',
    'debit',
    'inventory_adjustment_loss',
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  )
on conflict (tenant_id, code) do update
set
  name = excluded.name,
  account_type = excluded.account_type,
  normal_balance = excluded.normal_balance,
  system_key = excluded.system_key,
  updated_at = excluded.updated_at;

insert into public.cash_accounts (
  id,
  tenant_id,
  ledger_account_id,
  name,
  account_kind,
  currency,
  is_active,
  created_by,
  created_at,
  updated_at
)
values
  (
    'ca000000-0000-4000-8000-000000000001',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    'a0000000-0000-4000-8000-000000000001',
    'Main cash account',
    'cash',
    'PHP',
    true,
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'ca000000-0000-4000-8000-000000000002',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    'a0000000-0000-4000-8000-00000000000e',
    'Operating bank',
    'bank',
    'PHP',
    true,
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  )
on conflict (tenant_id, ledger_account_id) do update
set
  name = excluded.name,
  account_kind = excluded.account_kind,
  currency = excluded.currency,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

insert into public.units_of_measure (
  id,
  tenant_id,
  code,
  name,
  decimal_places,
  is_active,
  created_by,
  created_at,
  updated_at
)
values (
  'b1000000-0000-4000-8000-000000000001',
  '2b2b039c-b066-412b-af4c-564f2af6097e',
  'PCS',
  'Pieces',
  0,
  true,
  '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
)
on conflict do nothing;

insert into public.warehouses (
  id,
  tenant_id,
  code,
  name,
  project_id,
  is_active,
  created_by,
  created_at,
  updated_at
)
values (
  'a1000000-0000-4000-8000-000000000001',
  '2b2b039c-b066-412b-af4c-564f2af6097e',
  'MAIN',
  'Main materials Warehouse',
  null,
  true,
  '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
)
on conflict do nothing;

insert into public.material_items (
  id,
  tenant_id,
  code,
  description,
  category,
  unit,
  base_uom_id,
  inventory_tracked,
  is_active,
  created_by,
  created_at,
  updated_at
)
values (
  'a2000000-0000-4000-8000-000000000001',
  '2b2b039c-b066-412b-af4c-564f2af6097e',
  'MAT-LOCAL-001',
  'Local verification material',
  'Verification',
  'PCS',
  'b1000000-0000-4000-8000-000000000001',
  true,
  true,
  '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
)
on conflict (tenant_id, code) do update
set
  description = excluded.description,
  unit = excluded.unit,
  base_uom_id = excluded.base_uom_id,
  inventory_tracked = excluded.inventory_tracked,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

insert into public.cost_codes (
  id,
  tenant_id,
  code,
  name,
  category,
  is_active,
  created_by,
  created_at,
  updated_at
)
values
  (
    'c1000000-0000-4000-8000-000000000001',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    'MAT',
    'Materials',
    'material',
    true,
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    'LAB',
    'Labour',
    'labour',
    true,
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'c1000000-0000-4000-8000-000000000003',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    'SUB',
    'Subcontractors',
    'subcontractor',
    true,
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'c1000000-0000-4000-8000-000000000004',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    'EQP',
    'Equipment',
    'equipment',
    true,
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'c1000000-0000-4000-8000-000000000005',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    'OHD',
    'Project overhead',
    'overhead',
    true,
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  ),
  (
    'c1000000-0000-4000-8000-000000000006',
    '2b2b039c-b066-412b-af4c-564f2af6097e',
    'OTH',
    'Other project cost',
    'other',
    true,
    '0b6d8c68-2b7a-4f75-92f6-b539c91ad199',
    '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00'
  )
on conflict do nothing;

commit;
