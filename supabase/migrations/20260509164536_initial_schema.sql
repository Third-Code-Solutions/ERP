CREATE TYPE "public"."bom_status" AS ENUM('draft', 'approved', 'locked', 'archived');
--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('dxf', 'pdf', 'image', 'contract', 'bom', 'invoice', 'po', 'other');
--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'partial_payment', 'paid', 'overdue', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('opportunity_creation', 'scoping', 'bom_submission', 'resubmission', 'negotiation', 'closed_won', 'closed_lost');
--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('lead', 'active', 'on_hold', 'completed', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('mep', 'fit_out', 'interior', 'mixed');
--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'submitted', 'confirmed', 'partial_delivery', 'delivered', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'admin', 'estimator', 'sales', 'pm', 'viewer');
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"pcab_license" varchar(50),
	"bir_tin" varchar(20),
	"dpo_contact" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"role" "role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"client" varchar(255) NOT NULL,
	"location" text,
	"project_type" "project_type",
	"status" "project_status" DEFAULT 'lead' NOT NULL,
	"total_sqm" integer,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"rep_id" uuid,
	"stage" "opportunity_stage" DEFAULT 'opportunity_creation' NOT NULL,
	"tcv_cents" bigint DEFAULT 0 NOT NULL,
	"gp_cents" bigint DEFAULT 0 NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"weighted_tcv_cents" bigint DEFAULT 0 NOT NULL,
	"closing_date" timestamp with time zone,
	"area_sqm" integer,
	"opportunity_type" text,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prob_range" CHECK ("opportunities"."probability" >= 0 AND "opportunities"."probability" <= 100)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"document_type" "document_type" NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" varchar(127) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scope_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid,
	"code" varchar(50),
	"description" text NOT NULL,
	"unit" varchar(20) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" bigint DEFAULT 0 NOT NULL,
	"line_total_cents" bigint DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"created_by" uuid,
	"approved_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"label" varchar(255),
	"status" "bom_status" DEFAULT 'draft' NOT NULL,
	"total_cost_cents" bigint DEFAULT 0 NOT NULL,
	"tcv_cents" bigint DEFAULT 0 NOT NULL,
	"gp_cents" bigint DEFAULT 0 NOT NULL,
	"gp_margin_bps" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"approved_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bom_id" uuid NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_group" integer DEFAULT 0 NOT NULL,
	"code" varchar(50),
	"description" text NOT NULL,
	"unit" varchar(20),
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" bigint DEFAULT 0 NOT NULL,
	"markup_bps" integer DEFAULT 0 NOT NULL,
	"line_total_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_name" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"address" text,
	"bir_tin" varchar(20),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"vendor_id" uuid,
	"created_by" uuid,
	"po_number" varchar(50) NOT NULL,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
	"subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"vat_cents" bigint DEFAULT 0 NOT NULL,
	"withholding_tax_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"delivery_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "po_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"code" varchar(50),
	"description" text NOT NULL,
	"unit" varchar(20),
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" bigint DEFAULT 0 NOT NULL,
	"line_total_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid,
	"invoice_number" varchar(50) NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"billing_percent_bps" integer DEFAULT 0 NOT NULL,
	"retention_bps" integer DEFAULT 1000 NOT NULL,
	"subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"retention_cents" bigint DEFAULT 0 NOT NULL,
	"vat_cents" bigint DEFAULT 0 NOT NULL,
	"withholding_tax_cents" bigint DEFAULT 0 NOT NULL,
	"net_amount_cents" bigint DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"diff" jsonb,
	"prev_hash" varchar(64) DEFAULT 'genesis' NOT NULL,
	"hash" varchar(64) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" text,
	"model" varchar(100) DEFAULT 'text-embedding-3-small' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_rep_id_users_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bom_line_items" ADD CONSTRAINT "bom_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bom_line_items" ADD CONSTRAINT "bom_line_items_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tenants_slug" ON "tenants" USING btree ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_tenant_email" ON "users" USING btree ("tenant_id","email");
--> statement-breakpoint
CREATE INDEX "idx_users_tenant_id" ON "users" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_projects_tenant_id" ON "projects" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_projects_tenant_status" ON "projects" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "idx_projects_created_by" ON "projects" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "idx_opportunities_tenant_id" ON "opportunities" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_opportunities_project_id" ON "opportunities" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_opportunities_rep_id" ON "opportunities" USING btree ("rep_id");
--> statement-breakpoint
CREATE INDEX "idx_opportunities_tenant_stage" ON "opportunities" USING btree ("tenant_id","stage");
--> statement-breakpoint
CREATE INDEX "idx_documents_tenant_id" ON "documents" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_documents_project_id" ON "documents" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_documents_uploaded_by" ON "documents" USING btree ("uploaded_by");
--> statement-breakpoint
CREATE INDEX "idx_documents_tenant_type" ON "documents" USING btree ("tenant_id","document_type");
--> statement-breakpoint
CREATE INDEX "idx_scope_items_tenant_id" ON "scope_items" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_scope_items_project_id" ON "scope_items" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_boms_tenant_id" ON "boms" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_boms_project_id" ON "boms" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_boms_opportunity_id" ON "boms" USING btree ("opportunity_id");
--> statement-breakpoint
CREATE INDEX "idx_boms_tenant_status" ON "boms" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "idx_bom_line_items_tenant_id" ON "bom_line_items" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_bom_line_items_bom_id" ON "bom_line_items" USING btree ("bom_id");
--> statement-breakpoint
CREATE INDEX "idx_bom_line_items_parent_id" ON "bom_line_items" USING btree ("parent_id");
--> statement-breakpoint
CREATE INDEX "idx_vendors_tenant_id" ON "vendors" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vendors_tenant_name" ON "vendors" USING btree ("tenant_id","name");
--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_tenant_id" ON "purchase_orders" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_project_id" ON "purchase_orders" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_vendor_id" ON "purchase_orders" USING btree ("vendor_id");
--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_tenant_status" ON "purchase_orders" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_po_number" ON "purchase_orders" USING btree ("tenant_id","po_number");
--> statement-breakpoint
CREATE INDEX "idx_po_line_items_tenant_id" ON "po_line_items" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_po_line_items_po_id" ON "po_line_items" USING btree ("po_id");
--> statement-breakpoint
CREATE INDEX "idx_invoices_tenant_id" ON "invoices" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_invoices_project_id" ON "invoices" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_invoices_tenant_status" ON "invoices" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "idx_invoices_invoice_number" ON "invoices" USING btree ("tenant_id","invoice_number");
--> statement-breakpoint
CREATE INDEX "idx_invoices_due_date" ON "invoices" USING btree ("tenant_id","due_date");
--> statement-breakpoint
CREATE INDEX "idx_audit_log_tenant_id" ON "audit_log" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_audit_log_entity" ON "audit_log" USING btree ("entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX "idx_audit_log_actor_id" ON "audit_log" USING btree ("actor_id");
--> statement-breakpoint
CREATE INDEX "idx_audit_log_tenant_created" ON "audit_log" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_embeddings_tenant_id" ON "embeddings" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "idx_embeddings_entity" ON "embeddings" USING btree ("entity_type","entity_id");
