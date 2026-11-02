import type { IssuerLegalProfileSnapshot } from '@third-code-erp/database/schema'

export interface CompanyDocumentIdentity {
  workspace_name: string
  legal_name: string | null
  registered_address: string | null
  document_email: string | null
  document_phone: string | null
  bir_tin: string | null
  pcab_license: string | null
}

export function companyDocumentIdentity(
  value: CompanyDocumentIdentity
): CompanyDocumentIdentity {
  return {
    workspace_name: value.workspace_name.trim(),
    legal_name: value.legal_name?.trim() || null,
    registered_address: value.registered_address?.trim() || null,
    document_email: value.document_email?.trim() || null,
    document_phone: value.document_phone?.trim() || null,
    bir_tin: value.bir_tin?.trim() || null,
    pcab_license: value.pcab_license?.trim() || null,
  }
}

export function identityFromSnapshot(
  snapshot: IssuerLegalProfileSnapshot
): CompanyDocumentIdentity {
  return companyDocumentIdentity(snapshot)
}

export function resolveDocumentIdentity(input: {
  current: CompanyDocumentIdentity | null
  snapshot: IssuerLegalProfileSnapshot | null
  previouslyIssued: boolean
}): { identity: CompanyDocumentIdentity | null; legacyIdentityMissing: boolean } {
  if (input.snapshot) {
    return {
      identity: identityFromSnapshot(input.snapshot),
      legacyIdentityMissing: false,
    }
  }
  return {
    identity: input.previouslyIssued ? null : input.current,
    legacyIdentityMissing: input.previouslyIssued,
  }
}

export function missingDocumentIdentityFields(
  identity: CompanyDocumentIdentity
): string[] {
  return [
    !identity.legal_name && 'legal name',
    !identity.registered_address && 'registered address',
    !identity.bir_tin && 'BIR TIN',
  ].filter((field): field is string => Boolean(field))
}

export function companyMark(identity: CompanyDocumentIdentity): string {
  const source = identity.legal_name || identity.workspace_name
  const mark = source
    .split(/\s+/)
    .map((word) => word.match(/[A-Za-z0-9]/)?.[0] ?? '')
    .join('')
    .slice(0, 3)
    .toUpperCase()
  return mark || 'CO'
}
