-- BuildOps demo seed (idempotent)
--
-- Populates the existing E2E tenant with a realistic dataset so the dashboard
-- and pipeline render with lived-in data during a live client demo.
--
-- Run via: psql "$DATABASE_URL" -f apps/web/scripts/seed-demo.sql
-- Re-runnable: existing rows are matched by (tenant_id, name) or by
-- well-known UUID and refreshed in place via ON CONFLICT.

DO $demo$
DECLARE
  v_tenant uuid;
  v_user   uuid;
  v_proj_somnus uuid := '11111111-1111-4111-8111-111111111111';
  v_proj_ayala  uuid := '22222222-2222-4222-8222-222222222222';
  v_proj_bgc    uuid := '33333333-3333-4333-8333-333333333333';
  v_opp_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_opp_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_opp_c uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_opp_d uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_opp_e uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_bom uuid;
  v_inv1 uuid;
  v_inv2 uuid;
  v_vendor1 uuid := '55555555-5555-4555-8555-555555555555';
  v_vendor2 uuid := '66666666-6666-4666-8666-666666666666';
  v_po1 uuid := '77777777-7777-4777-8777-777777777777';
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE name = 'BuildOps E2E Tenant' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Demo seed requires the BuildOps E2E Tenant to exist';
  END IF;

  SELECT id INTO v_user FROM users WHERE tenant_id = v_tenant LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Demo seed requires at least one user in the tenant';
  END IF;

  -- ------------------------------------------------------------ projects
  INSERT INTO projects (id, tenant_id, name, client, location, project_type, status, total_sqm, notes, created_by)
  VALUES
    (v_proj_somnus, v_tenant, 'Somnus Studios — Phase 2', 'Somnus Hospitality', 'Bonifacio Global City',  'fit_out', 'active',    1820, 'Boutique hotel fit-out, 6 floors. Repeat client, GP target 28%.', v_user),
    (v_proj_ayala,  v_tenant, 'Ayala Premier Tower MEP',   'Ayala Land Premier', 'Makati CBD',             'mep',     'active',    9400, 'Class-A office MEP rough-in. Critical-path schedule, weekly partial billing.', v_user),
    (v_proj_bgc,    v_tenant, 'BGC One Bonifacio Lobby',   'Bonifacio Land',     'Bonifacio Global City',  'interior','completed',  640, 'Premium lobby refresh; closed Q1 2026 above margin.', v_user)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, client = EXCLUDED.client, location = EXCLUDED.location,
    project_type = EXCLUDED.project_type, status = EXCLUDED.status,
    total_sqm = EXCLUDED.total_sqm, notes = EXCLUDED.notes, updated_at = NOW();

  -- ------------------------------------------------------------ opportunities (5: spread across stages)
  INSERT INTO opportunities (id, tenant_id, project_id, rep_id, stage, tcv_cents, gp_cents, probability, weighted_tcv_cents, closing_date, area_sqm, opportunity_type, remarks)
  VALUES
    (v_opp_a, v_tenant, v_proj_somnus, v_user, 'negotiation',     185000000, 47500000, 75, 138750000, NOW() + interval '21 days', 1820, 'fit_out',  'Final TCV negotiation. Awaiting markup approval from client.'),
    (v_opp_b, v_tenant, v_proj_ayala,  v_user, 'bom_submission',  962000000, 224000000, 40, 384800000, NOW() + interval '45 days', 9400, 'mep',      'BOM submitted. Client comparing vs two competitors.'),
    (v_opp_c, v_tenant, v_proj_bgc,    v_user, 'closed_won',       73500000, 21800000, 100, 73500000, NOW() - interval '60 days',  640, 'interior', 'Closed won at 29.7% margin. Use as reference.'),
    (v_opp_d, v_tenant, v_proj_somnus, v_user, 'scoping',          54000000,  9800000, 25,  13500000, NOW() + interval '30 days',  420, 'mep',      'Add-on package — rooftop F&B mech.'),
    (v_opp_e, v_tenant, v_proj_ayala,  v_user, 'opportunity_creation', 285000000, 68000000, 10,  28500000, NOW() + interval '90 days', 3200, 'fit_out',  'Tower 2 fit-out lead. Initial RFI received.')
  ON CONFLICT (id) DO UPDATE SET
    stage = EXCLUDED.stage, tcv_cents = EXCLUDED.tcv_cents, gp_cents = EXCLUDED.gp_cents,
    probability = EXCLUDED.probability, weighted_tcv_cents = EXCLUDED.weighted_tcv_cents,
    closing_date = EXCLUDED.closing_date, remarks = EXCLUDED.remarks, updated_at = NOW();

  -- ------------------------------------------------------------ vendors
  INSERT INTO vendors (id, tenant_id, name, contact_name, email, phone, bir_tin, address)
  VALUES
    (v_vendor1, v_tenant, 'Daikin Phils. Trading',  'Mark Tan',   'mark@daikin.ph',   '+63-2-8888-1234', '004-872-145-000', 'Mandaluyong City'),
    (v_vendor2, v_tenant, 'Powermatic Industries', 'Joana Reyes', 'jreyes@powermatic.ph', '+63-2-8771-9000', '003-117-422-000', 'Quezon City')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, contact_name = EXCLUDED.contact_name, email = EXCLUDED.email,
    phone = EXCLUDED.phone, bir_tin = EXCLUDED.bir_tin, address = EXCLUDED.address;

  -- ------------------------------------------------------------ approved BOM on Somnus (use existing latest if present)
  SELECT id INTO v_bom
  FROM boms
  WHERE tenant_id = v_tenant AND project_id = v_proj_somnus
  ORDER BY version DESC LIMIT 1;

  IF v_bom IS NULL THEN
    INSERT INTO boms (tenant_id, project_id, version, status, label, total_cost_cents, tcv_cents, gp_cents, gp_margin_bps, notes, approved_by, approved_at)
    VALUES (v_tenant, v_proj_somnus, 1, 'approved', 'Somnus Phase 2 — approved baseline', 137500000, 185000000, 47500000, 2567, 'Approved BOM used as procurement source.', v_user, NOW() - interval '10 days')
    RETURNING id INTO v_bom;

    INSERT INTO bom_line_items (tenant_id, bom_id, sort_order, is_group, code, description, unit, quantity, unit_cost_cents, markup_bps, line_total_cents, notes)
    VALUES
      (v_tenant, v_bom, 0, 0, 'M-100', 'Fan Coil Unit, 2HP ceiling-cassette',     'pcs', 24, 8500000, 3500, 275400000, 'Cost from RAG (89% match) — verify'),
      (v_tenant, v_bom, 1, 0, 'M-110', 'Air Handling Unit, 5TR',                   'pcs',  4, 35000000, 3000, 182000000, 'Cost from Catalog (Air Handling Unit) — verify with vendor quote'),
      (v_tenant, v_bom, 2, 0, 'E-200', 'Distribution Panel, 200A 12-way',          'pcs',  6, 4500000, 3500, 36450000, 'Cost from Catalog (Distribution Panel) — verify with vendor quote'),
      (v_tenant, v_bom, 3, 0, 'E-210', 'LED Downlight 18W',                        'pcs', 320, 120000, 4000, 53760000, 'Cost from RAG (94% match) — verify'),
      (v_tenant, v_bom, 4, 0, 'P-300', 'Toilet (WC) — dual flush',                 'pcs', 12, 1800000, 3000, 28080000, 'Cost from Catalog (Toilet (WC) - dual flush) — verify with vendor quote'),
      (v_tenant, v_bom, 5, 0, 'F-400', 'Sprinkler Head (pendant K5.6)',            'pcs', 95, 180000, 3500, 23085000, 'Manual unit cost'),
      (v_tenant, v_bom, 6, 0, 'L-500', 'Architecture wall/floor composite',        'sqm', 1820, 850000, 3000, 2011100000, 'Cost from Catalog (Architecture wall/floor composite) — verify with vendor quote');
  END IF;

  -- ------------------------------------------------------------ invoices (2 progress billings on Somnus)
  -- Progress billing #1: 30% complete
  IF NOT EXISTS (SELECT 1 FROM invoices WHERE tenant_id = v_tenant AND invoice_number = 'INV-202604-001') THEN
    INSERT INTO invoices (tenant_id, project_id, created_by, invoice_number, status, billing_percent_bps, retention_bps, subtotal_cents, retention_cents, vat_cents, withholding_tax_cents, net_amount_cents, due_date, notes, created_at)
    VALUES (v_tenant, v_proj_somnus, v_user, 'INV-202604-001', 'paid', 3000, 1000, 55500000, 5550000, 5994000, 999000, 54945000, NOW() - interval '5 days', '30% milestone billing — slab pour complete', NOW() - interval '35 days')
    RETURNING id INTO v_inv1;
  END IF;

  -- Progress billing #2: 50% complete (current period, issued)
  IF NOT EXISTS (SELECT 1 FROM invoices WHERE tenant_id = v_tenant AND invoice_number = 'INV-202605-001') THEN
    INSERT INTO invoices (tenant_id, project_id, created_by, invoice_number, status, billing_percent_bps, retention_bps, subtotal_cents, retention_cents, vat_cents, withholding_tax_cents, net_amount_cents, due_date, notes, created_at)
    VALUES (v_tenant, v_proj_somnus, v_user, 'INV-202605-001', 'issued', 2000, 1000, 37000000, 3700000, 3996000, 666000, 36630000, NOW() + interval '15 days', '20% milestone billing — MEP rough-in 60% complete', NOW() - interval '3 days')
    RETURNING id INTO v_inv2;
  END IF;

  -- ------------------------------------------------------------ purchase order from BOM
  IF NOT EXISTS (SELECT 1 FROM purchase_orders WHERE id = v_po1) THEN
    INSERT INTO purchase_orders (id, tenant_id, project_id, vendor_id, created_by, po_number, status, subtotal_cents, vat_cents, withholding_tax_cents, total_cents, delivery_date, notes)
    VALUES (v_po1, v_tenant, v_proj_somnus, v_vendor1, v_user, 'PO-2026-0001', 'partial_delivery', 344000000, 41280000, 6880000, 378400000, NOW() + interval '14 days', 'HVAC equipment package — partial delivery in progress');

    INSERT INTO po_line_items (tenant_id, po_id, sort_order, code, description, unit, quantity, unit_cost_cents, line_total_cents, received_qty, received_at, received_by, notes)
    VALUES
      (v_tenant, v_po1, 0, 'M-100', 'Fan Coil Unit, 2HP ceiling-cassette', 'pcs', 24, 8500000, 204000000, 18, NOW() - interval '2 days', v_user, '18 of 24 received; 6 backordered to next week'),
      (v_tenant, v_po1, 1, 'M-110', 'Air Handling Unit, 5TR',              'pcs',  4, 35000000, 140000000,  4, NOW() - interval '5 days', v_user, 'All 4 received and inspected');
  END IF;

  -- ------------------------------------------------------------ comments on Somnus
  INSERT INTO project_comments (tenant_id, project_id, author_id, body, mentions, created_at)
  SELECT v_tenant, v_proj_somnus, v_user,
    body, '{}'::uuid[], created_at
  FROM (VALUES
    ('Kicking off MEP rough-in this Friday. Site team confirmed access.', NOW() - interval '6 days'),
    ('FCU delivery tracker shared with PM. 18 of 24 on site.', NOW() - interval '2 days'),
    ('Client confirmed milestone #2 — billing approved for 20% (INV-202605-001).', NOW() - interval '6 hours')
  ) AS c(body, created_at)
  WHERE NOT EXISTS (
    SELECT 1 FROM project_comments
    WHERE tenant_id = v_tenant AND project_id = v_proj_somnus
    LIMIT 1
  );

  RAISE NOTICE 'Demo seed complete. Tenant=%  User=%', v_tenant, v_user;
END $demo$;

-- Quick post-seed summary
SELECT 'after_seed' AS phase,
  (SELECT count(*) FROM projects)        AS projects,
  (SELECT count(*) FROM opportunities)   AS opportunities,
  (SELECT count(*) FROM boms)            AS boms,
  (SELECT count(*) FROM bom_line_items)  AS bom_lines,
  (SELECT count(*) FROM purchase_orders) AS pos,
  (SELECT count(*) FROM po_line_items)   AS po_lines,
  (SELECT count(*) FROM invoices)        AS invoices,
  (SELECT count(*) FROM project_comments) AS comments;
