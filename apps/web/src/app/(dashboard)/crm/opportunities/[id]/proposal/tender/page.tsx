import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { notFound } from 'next/navigation'
import { and, asc, desc, eq } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  documents,
  opportunities,
  tenderDeviations,
  tenderEvaluationCriteria,
  tenderEvaluationScores,
  tenderPackages,
  tenderVendorProfiles,
  vendors,
} from '@third-code-erp/database/schema'
import { ProposalSubNav } from '@/components/proposal/sub-nav'
import {
  addTenderCriterion,
  addTenderDeviation,
  addTenderVendorProfile,
  createTenderPackage,
  scoreTender as scoreTenderResult,
  transitionTender,
} from '../tender-actions'
import { TenderActionForm } from '../tender-action-form'

interface PageProps { params: Promise<{ id: string }> }

const badge = (value: string) => value.replace(/_/g, ' ')

export default async function TenderPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireUserProfile()
  const [opportunity] = await db.select({ id: opportunities.id, accountName: accounts.name }).from(opportunities).leftJoin(accounts, and(eq(accounts.id, opportunities.account_id), eq(accounts.tenant_id, profile.tenantId))).where(and(eq(opportunities.id, id), eq(opportunities.tenant_id, profile.tenantId))).limit(1)
  if (!opportunity) notFound()

  const [tender] = await db.select({ id: tenderPackages.id, title: tenderPackages.title, reference: tenderPackages.reference, sourceMode: tenderPackages.source_mode, status: tenderPackages.status, torDocumentId: tenderPackages.tor_document_id, boqDocumentId: tenderPackages.boq_document_id, boundBomId: tenderPackages.bound_bom_id, closingAt: tenderPackages.closing_at, version: tenderPackages.version }).from(tenderPackages).where(and(eq(tenderPackages.opportunity_id, id), eq(tenderPackages.tenant_id, profile.tenantId))).orderBy(desc(tenderPackages.created_at)).limit(1)
  const [documentOptions, vendorOptions] = await Promise.all([
    db.select({ id: documents.id, fileName: documents.file_name, documentType: documents.document_type }).from(documents).where(and(eq(documents.opportunity_id, id), eq(documents.tenant_id, profile.tenantId))).orderBy(desc(documents.created_at)),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(eq(vendors.tenant_id, profile.tenantId)).orderBy(asc(vendors.name)),
  ])

  const canManage = can(profile.role, 'tender.manage')
  const canEvaluate = can(profile.role, 'tender.evaluate')
  if (!tender) {
    return (
      <div>
        <Header opportunityId={id} accountName={opportunity.accountName} title="Tender / bid mode" subtitle="Capture a client-issued TOR and BOQ before the project exists." />
        <ProposalSubNav opportunityId={id} />
        {canManage ? (
          <section className="card" aria-labelledby="create-tender">
            <div className="card-header"><h2 id="create-tender" className="card-title">Create tender package</h2><p className="card-subtitle">Opportunity-level evidence. BOQ rows bind to the commercial BOM only after project conversion.</p></div>
            <TenderActionForm action={createTenderPackage} className="tender-form">
              <input type="hidden" name="opportunityId" value={id} />
              <input type="hidden" name="clientRequestId" value={randomUUID()} />
              <label>Title<input name="title" required maxLength={255} placeholder="MNHPI fit-out tender" /></label>
              <label>Reference<input name="reference" required maxLength={120} placeholder="TND-2026-001" /></label>
              <label>Source mode<select name="sourceMode" defaultValue="client_issued_boq"><option value="client_issued_boq">Client-issued TOR + BOQ</option><option value="abi_generated_bom">ABI-generated BOM</option></select></label>
              <label>TOR document<select name="torDocumentId" defaultValue=""><option value="">— Not linked yet —</option>{documentOptions.map((document) => <option key={document.id} value={document.id}>{document.fileName} · {document.documentType}</option>)}</select></label>
              <label>BOQ document<select name="boqDocumentId" defaultValue=""><option value="">— Select BOQ evidence —</option>{documentOptions.map((document) => <option key={document.id} value={document.id}>{document.fileName} · {document.documentType}</option>)}</select></label>
              <label>Closing date<input type="datetime-local" name="closingAt" /></label>
              <button type="submit" className="button-primary">Create tender package</button>
            </TenderActionForm>
          </section>
        ) : <div className="card"><div className="card-empty">No tender package has been created for this opportunity.</div></div>}
        <TenderBoundaryNote />
      </div>
    )
  }

  const [deviations, criteria, profiles, scores] = await Promise.all([
    db.select({ id: tenderDeviations.id, category: tenderDeviations.category, title: tenderDeviations.title, description: tenderDeviations.description, sourceReference: tenderDeviations.source_reference, status: tenderDeviations.status }).from(tenderDeviations).where(and(eq(tenderDeviations.tender_id, tender.id), eq(tenderDeviations.tenant_id, profile.tenantId))).orderBy(desc(tenderDeviations.created_at)),
    db.select({ id: tenderEvaluationCriteria.id, name: tenderEvaluationCriteria.name, criterionType: tenderEvaluationCriteria.criterion_type, weightBps: tenderEvaluationCriteria.weight_bps, isRequired: tenderEvaluationCriteria.is_required }).from(tenderEvaluationCriteria).where(and(eq(tenderEvaluationCriteria.tender_id, tender.id), eq(tenderEvaluationCriteria.tenant_id, profile.tenantId))).orderBy(asc(tenderEvaluationCriteria.sort_order), asc(tenderEvaluationCriteria.created_at)),
    db.select({ id: tenderVendorProfiles.id, vendorId: tenderVendorProfiles.vendor_id, vendorName: vendors.name, trade: tenderVendorProfiles.trade, status: tenderVendorProfiles.status }).from(tenderVendorProfiles).innerJoin(vendors, and(eq(vendors.id, tenderVendorProfiles.vendor_id), eq(vendors.tenant_id, profile.tenantId))).where(and(eq(tenderVendorProfiles.tender_id, tender.id), eq(tenderVendorProfiles.tenant_id, profile.tenantId))).orderBy(asc(vendors.name)),
    db.select({ id: tenderEvaluationScores.id, vendorProfileId: tenderEvaluationScores.vendor_profile_id, criterionId: tenderEvaluationScores.criterion_id, scoreBps: tenderEvaluationScores.score_bps, notes: tenderEvaluationScores.notes, version: tenderEvaluationScores.version }).from(tenderEvaluationScores).where(and(eq(tenderEvaluationScores.tender_id, tender.id), eq(tenderEvaluationScores.tenant_id, profile.tenantId))),
  ])
  const scoreMap = new Map(scores.map((score) => [`${score.vendorProfileId}:${score.criterionId}`, score]))
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weightBps, 0)

  return (
    <div>
      <Header opportunityId={id} accountName={opportunity.accountName} title={tender.title} subtitle={`${tender.reference} · ${badge(tender.sourceMode)} · ${badge(tender.status)}`} />
      <ProposalSubNav opportunityId={id} />
      <section className="card tender-summary" aria-labelledby="tender-summary">
        <div><h2 id="tender-summary" className="card-title">Tender control</h2><p className="card-subtitle">Evidence is tenant-scoped and every review change is audited.</p></div>
        <div className="tender-summary-grid"><Meta label="Status" value={badge(tender.status)} /><Meta label="Source" value={badge(tender.sourceMode)} /><Meta label="Closing" value={tender.closingAt ? new Date(tender.closingAt).toLocaleString('en-PH') : 'Not set'} /><Meta label="Criteria weight" value={`${totalWeight} bps / 10000`} /><Meta label="Deviations" value={String(deviations.length)} /><Meta label="Vendors" value={String(profiles.length)} /></div>
        {canManage || canEvaluate ? <TenderActionForm action={transitionTender} className="inline-form"><input type="hidden" name="opportunityId" value={id} /><input type="hidden" name="tenderId" value={tender.id} /><input type="hidden" name="expectedVersion" value={tender.version} /><label>Move to<select name="status" defaultValue={tender.status}>{canManage && <><option value="draft">Draft</option><option value="open">Open</option><option value="evaluating">Evaluating</option><option value="closed">Closed</option></>}{canEvaluate && <option value="submitted">Submitted</option>}</select></label><button className="button-secondary" type="submit">Save status</button></TenderActionForm> : null}
      </section>

      <div className="section-grid-2">
        <Register title="Deviation register" subtitle="Scope, quantity, unit, exclusion, schedule and commercial departures." columns={['Category', 'Title', 'Source', 'Status']} rows={deviations.map((row) => [badge(row.category), row.title, row.sourceReference || '—', badge(row.status)])} empty="No deviations recorded." />
        <section className="card" aria-labelledby="add-deviation"><div className="card-header"><h2 id="add-deviation" className="card-title">Add deviation</h2></div>{canManage ? <TenderActionForm action={addTenderDeviation} className="tender-form compact"><input type="hidden" name="opportunityId" value={id} /><input type="hidden" name="tenderId" value={tender.id} /><label>Category<select name="category" defaultValue="scope"><option value="scope">Scope</option><option value="quantity">Quantity</option><option value="unit">Unit</option><option value="exclusion">Exclusion</option><option value="schedule">Schedule</option><option value="commercial">Commercial</option></select></label><label>Title<input name="title" required maxLength={255} /></label><label>Description<textarea name="description" required rows={3} /></label><label>Source reference<input name="sourceReference" maxLength={255} placeholder="TOR §3.2 / BOQ line 14" /></label><button className="button-primary" type="submit">Add deviation</button></TenderActionForm> : <div className="card-empty">Read-only for this role.</div>}</section>
      </div>

      <div className="section-grid-2">
        <Register title="Evaluation criteria" subtitle="Weighted review criteria. Scores are basis points, never floating money." columns={['Criterion', 'Type', 'Weight', 'Required']} rows={criteria.map((row) => [row.name, badge(row.criterionType), `${row.weightBps} bps`, row.isRequired ? 'Yes' : 'No'])} empty="No evaluation criteria recorded." />
        <section className="card" aria-labelledby="add-criterion"><div className="card-header"><h2 id="add-criterion" className="card-title">Add criterion</h2></div>{canManage ? <TenderActionForm action={addTenderCriterion} className="tender-form compact"><input type="hidden" name="opportunityId" value={id} /><input type="hidden" name="tenderId" value={tender.id} /><label>Name<input name="name" required maxLength={160} placeholder="Technical approach" /></label><label>Type<select name="criterionType" defaultValue="technical"><option value="price">Price</option><option value="technical">Technical</option><option value="schedule">Schedule</option><option value="safety">Safety</option><option value="experience">Experience</option><option value="commercial">Commercial</option><option value="other">Other</option></select></label><label>Weight (bps)<input name="weightBps" type="number" min="1" max="10000" required placeholder="2500" /></label><label>Description<textarea name="description" rows={2} /></label><label className="checkbox-field"><input name="isRequired" type="checkbox" /> Required for submission</label><button className="button-primary" type="submit">Add criterion</button></TenderActionForm> : <div className="card-empty">Read-only for this role.</div>}</section>
      </div>

      <div className="section-grid-2">
        <Register title="Subcontractor profiles" subtitle="Internal qualification context; no external vendor portal is implied." columns={['Vendor', 'Trade', 'Status']} rows={profiles.map((row) => [row.vendorName, row.trade || '—', badge(row.status)])} empty="No vendor profiles recorded." />
        <section className="card" aria-labelledby="add-profile"><div className="card-header"><h2 id="add-profile" className="card-title">Add vendor profile</h2></div>{canManage ? <TenderActionForm action={addTenderVendorProfile} className="tender-form compact"><input type="hidden" name="opportunityId" value={id} /><input type="hidden" name="tenderId" value={tender.id} /><label>Vendor<select name="vendorId" required defaultValue=""><option value="">Select vendor</option>{vendorOptions.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label>Trade<input name="trade" maxLength={120} placeholder="HVAC / electrical / finishes" /></label><label>Capability summary<textarea name="capabilitySummary" rows={3} /></label><button className="button-primary" type="submit">Add profile</button></TenderActionForm> : <div className="card-empty">Read-only for this role.</div>}</section>
      </div>

      <section className="card" aria-labelledby="evaluation-matrix"><div className="card-header"><h2 id="evaluation-matrix" className="card-title">Internal evaluation matrix</h2><p className="card-subtitle">Required criteria must be scored before a tender can be submitted. Commercial award remains human-approved.</p></div>{profiles.length === 0 || criteria.length === 0 ? <div className="card-empty">Add at least one vendor profile and one criterion to score the tender.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Vendor</th>{criteria.map((criterion) => <th key={criterion.id}>{criterion.name}<br /><span className="muted">{criterion.weightBps} bps</span></th>)}</tr></thead><tbody>{profiles.map((vendorProfile) => <tr key={vendorProfile.id}><td><strong>{vendorProfile.vendorName}</strong><br /><span className="muted">{vendorProfile.trade || 'Trade not set'}</span></td>{criteria.map((criterion) => { const score = scoreMap.get(`${vendorProfile.id}:${criterion.id}`); return <td key={criterion.id}>{canEvaluate ? <TenderActionForm action={scoreTenderResult} className="score-form"><input type="hidden" name="opportunityId" value={id} /><input type="hidden" name="tenderId" value={tender.id} /><input type="hidden" name="vendorProfileId" value={vendorProfile.id} /><input type="hidden" name="criterionId" value={criterion.id} /><input type="hidden" name="expectedVersion" value={score?.version ?? ''} /><input name="scoreBps" type="number" min="0" max="10000" defaultValue={score?.scoreBps ?? ''} placeholder="0–10000" required /><input name="notes" defaultValue={score?.notes ?? ''} placeholder="Evidence / note" /><button className="button-secondary" type="submit">{score ? 'Update' : 'Score'}</button></TenderActionForm> : <span>{score ? `${score.scoreBps} bps` : '—'}</span>}</td> })}</tr>)}</tbody></table></div>}</section>
      <TenderBoundaryNote />
      <style>{styles}</style>
    </div>
  )
}

function Header({ opportunityId, accountName, title, subtitle }: { opportunityId: string; accountName: string | null; title: string; subtitle: string }) {
  return <div className="page-header"><p className="page-eyebrow"><Link href={`/crm/opportunities/${opportunityId}/proposal`} style={{ color: 'inherit', textDecoration: 'none' }}>{accountName ?? 'Opportunity'} · Proposal</Link></p><div className="page-toolbar"><div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div></div></div>
}

function Meta({ label, value }: { label: string; value: string }) { return <div><span className="muted meta-label">{label}</span><strong>{value}</strong></div> }

function Register({ title, subtitle, columns, rows, empty }: { title: string; subtitle: string; columns: string[]; rows: string[][]; empty: string }) {
  return <section className="card"><div className="card-header"><h2 className="card-title">{title}</h2><p className="card-subtitle">{subtitle}</p></div>{rows.length === 0 ? <div className="card-empty">{empty}</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div>}</section>
}

function TenderBoundaryNote() { return <p className="tender-note">Tender intake is opportunity-first. Client BOQ lines stay document evidence until a won opportunity has an existing BOM; no duplicate scope model, automatic award, SAP interface, or external vendor portal is created here.</p> }

const styles = `
.tender-summary { display: grid; gap: 16px; margin-bottom: 18px; }
.tender-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; padding: 14px; background: var(--color-neutral-50); border-radius: 6px; }
.meta-label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 3px; }
.tender-form { display: grid; gap: 12px; max-width: 720px; padding: 16px; }
.tender-form.compact { max-width: none; }
.tender-form label, .inline-form label { display: grid; gap: 5px; font-size: 12px; font-weight: 600; color: var(--color-neutral-700); }
.tender-form .checkbox-field { display: flex; align-items: center; gap: 7px; }
.tender-form .checkbox-field input { width: auto; }
.tender-form input, .tender-form select, .tender-form textarea, .inline-form select, .score-form input { font: inherit; font-size: 13px; border: 1px solid var(--color-border); border-radius: 4px; padding: 7px 9px; background: white; }
.inline-form { display: flex; align-items: end; gap: 8px; flex-wrap: wrap; }
.score-form { display: grid; gap: 5px; min-width: 140px; }
.score-form input { width: 100%; }
.tender-form-error { margin: 0; color: var(--color-danger); font-size: 12px; }
.tender-form-pending { color: var(--color-neutral-500); font-size: 12px; }
.tender-note { color: var(--color-neutral-500); font-size: 12px; margin: 18px 0 0; }
@media (max-width: 700px) { .tender-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`
