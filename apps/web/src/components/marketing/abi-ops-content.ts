export const landingFaqs = [
  {
    question: 'What does ABI OPS connect?',
    answer:
      'Pipeline, proposals, drawings, scope, BOMs, procurement, site execution, cost, claims, billing, turnover, warranty, documents, decisions, and audit history share one connected project record.',
  },
  {
    question: 'Is it only for construction companies?',
    answer:
      'Construction is the deepest operating model. The same tenant, approval, project, procurement, billing, document, and knowledge foundations can support adjacent project-driven businesses without forcing construction terminology into every workflow.',
  },
  {
    question: 'How does Cortex use company knowledge?',
    answer:
      'Cortex retrieves records inside the user\'s authorized scope, shows source evidence, and preserves provenance. High-impact actions remain reviewable and require an authorized person.',
  },
  {
    question: 'Can the AI post payments or commitments by itself?',
    answer:
      'No. Financial postings, supplier commitments, access changes, deletions, and compliance submissions stay behind explicit authorization, validation, audit, and human approval.',
  },
  {
    question: 'Does it support Philippine construction controls?',
    answer:
      'The product models VAT, withholding, retention, progress billing, project cost, permits, and turnover workflows. Official forms and statutory outputs still require configuration and compliance review for each tenant.',
  },
] as const

export type ServiceIcon = 'estimate' | 'procure' | 'bill'

export const landingServices = [
  {
    id: 'win',
    index: '01',
    title: 'Pipeline and estimating',
    body: 'Leads, proposals and drawings become a reviewable bill of materials. Estimators keep their rates and the final say.',
    icon: 'estimate',
  },
  {
    id: 'buy',
    index: '02',
    title: 'Procurement and site',
    body: 'RFQs, purchase orders, deliveries, tasks and progress photos stay linked to the scope they serve.',
    icon: 'procure',
  },
  {
    id: 'bill',
    index: '03',
    title: 'Billing and compliance',
    body: 'Progress billing, retention, VAT and withholding follow Philippine practice, and every figure traces to its source.',
    icon: 'bill',
  },
] as const satisfies readonly {
  id: string
  index: string
  title: string
  body: string
  icon: ServiceIcon
}[]

export const landingStages = [
  {
    id: 'win',
    title: 'Win',
    headline: 'Pipeline becomes a controlled handoff.',
    body: 'Account, KYC, opportunity, proposal, inspection and commercial history move together when work is awarded.',
    output: 'Record: opportunity to award',
  },
  {
    id: 'estimate',
    title: 'Estimate',
    headline: 'Draft the BOM from the drawing.',
    body: 'Drawings and takeoffs become scope items and a draft bill of materials. Estimators review every line and override anything, with a reason on record.',
    output: 'Output: draft BOM',
  },
  {
    id: 'buy',
    title: 'Buy',
    headline: 'Compare suppliers before you commit.',
    body: 'RFQs, supplier comparisons and purchase orders stay linked from estimate to delivery, with approval before commitment.',
    output: 'Output: approved purchase order',
  },
  {
    id: 'build',
    title: 'Build',
    headline: 'Keep site work visible to handover.',
    body: 'Tasks, progress, photos, permits, deliveries and variation orders form one live history, with cost set against budget per scope.',
    output: 'Signal: cost against budget',
  },
  {
    id: 'bill',
    title: 'Bill',
    headline: 'Finish with billing and warranty intact.',
    body: 'Claims, invoices, retention, compliance documents, handover records and warranty issues remain searchable.',
    output: 'Output: progress billing',
  },
] as const

export const landingCapabilities = [
  {
    id: 'find',
    index: '01',
    title: 'Find the record',
    description: 'Search every approved record from one calm command surface.',
    detail:
      'Projects, drawings, RFQs, purchase orders, claims, invoices, tasks, and decisions stay connected to their source.',
  },
  {
    id: 'understand',
    index: '02',
    title: 'Understand context',
    description: 'See why a number changed, not only what changed.',
    detail:
      'Cortex connects owners, dependencies, documents, approvals, and history into a permission-aware operating graph.',
  },
  {
    id: 'act',
    index: '03',
    title: 'Move work forward',
    description: 'Turn answers into reviewable next actions.',
    detail:
      'Draft follow-ups, procurement actions, billing packets, and schedules while people retain final approval.',
  },
  {
    id: 'prove',
    index: '04',
    title: 'Prove every decision',
    description: 'Trace every change back to its source and approver.',
    detail:
      'Tenant isolation, citations, provenance, and append-only audit history keep operations defensible.',
  },
] as const

export const landingPriorities = [
  {
    quote: 'Show me what needs attention now, then let me open the evidence.',
    role: 'Owner and leadership',
    context: 'Portfolio health, margin risk, approvals, and forecast',
  },
  {
    quote: 'Keep my estimating judgment. Remove the repetitive reconstruction.',
    role: 'Commercial and estimating',
    context: 'Scope, historical rates, BOM review, and audit',
  },
  {
    quote:
      'Give the site one source for today, not another place to report yesterday.',
    role: 'Project delivery',
    context: 'Tasks, materials, progress, blockers, and handover',
  },
  {
    quote: 'Make every payable, claim, and exception traceable before month-end.',
    role: 'Finance and compliance',
    context: 'Billing, retention, VAT, BIR records, and approvals',
  },
] as const

export const landingControls = [
  { value: '12%', label: 'VAT computed on taxable billing' },
  { value: '10%', label: 'Standard retention, set per project' },
  { value: 'SHA-256', label: 'Hash-chained, append-only audit log' },
  { value: '2307', label: 'BIR withholding certificate support' },
] as const

/**
 * The Cortex story, one chapter per beat of the brain animation. Every claim
 * here comes from ADR-007 (graph substrate) and the Cortex read-authority docs.
 */
export const landingCortexChapters = [
  {
    id: 'ingest',
    step: '01',
    name: 'Ingest',
    title: 'Every record becomes a memory.',
    body: 'Projects, accounts, people, documents, BOMs, purchase orders, invoices and tasks are written into one graph as nodes. Each node points back to the ERP row it came from, so nothing is copied and nothing drifts.',
    details: [
      'A derived projection: the ERP tables stay canonical',
      'Kept current by database triggers that can never block an ERP write',
      'Rebuildable from the ERP at any time',
    ],
  },
  {
    id: 'connect',
    step: '02',
    name: 'Connect',
    title: 'Memories connect to each other.',
    body: 'Ownership, dependencies, documents, approvals and history become edges. A variation order links to its BOM line, the purchase order, the claim and the person who approved it, so the context travels with the record.',
    details: [
      'Every edge records its origin: canonical, derived or AI-inferred',
      'Foreign-key links are never mistaken for inferred ones',
      'Bi-temporal: when a fact was true, and when it was recorded',
    ],
  },
  {
    id: 'recall',
    step: '03',
    name: 'Recall',
    title: 'Recall stays inside your access.',
    body: 'A question wakes only the memories you are allowed to open. Other tenants, other roles and records outside your scope stay dark. The graph is read under your row-level security, not around it.',
    details: [
      'Row-level security on every node, edge and provenance row',
      'Record types are scoped by role, so a finance seat sees finance records',
      'Write helpers are not exposed over the REST API',
    ],
  },
  {
    id: 'cite',
    step: '04',
    name: 'Cite',
    title: 'Every answer shows its sources.',
    body: 'The answer is assembled from a path of real records. Each step is cited with its provenance and freshness, so you can open the evidence behind any number before you rely on it.',
    details: [
      'Citations link straight to the source record',
      'Keyword retrieval, with optional semantic search under the same rules',
      'A focused record brings its own context pack',
    ],
  },
  {
    id: 'approve',
    step: '05',
    name: 'Approve',
    title: 'People approve what happens next.',
    body: 'Cortex drafts the follow-up, the procurement action or the billing packet. Financial postings, supplier commitments, access changes and compliance submissions wait at the gate for an authorized person.',
    details: [
      'Drafts are reviewable and never auto-posted',
      'Authorization is checked at the boundary, not in the prompt',
      'The AI cannot post payments or commitments by itself',
    ],
  },
  {
    id: 'prove',
    step: '06',
    name: 'Prove',
    title: 'Nothing is forgotten. Nothing is rewritten.',
    body: 'Every change is appended to a provenance log that is hash-chained per tenant. Each entry commits to the one before it, so history can be checked for tampering instead of taken on trust.',
    details: [
      'Append-only and SHA-256 hash-chained, per tenant',
      'Tamper-evident on ordering and linkage',
      'The same design as the ERP audit log',
    ],
  },
] as const
