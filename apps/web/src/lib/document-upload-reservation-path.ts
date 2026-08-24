type DocumentUploadReservationPathIdentity = Readonly<{
  tenantId: string
  projectId: string
  reservationId: string
  storagePath: string
}>

const SAFE_STORAGE_FILE_NAME = /^[a-zA-Z0-9._-]{1,200}$/

/**
 * Core owns reservation paths. Web accepts only the exact canonical identity
 * shape so a compromised or misconfigured upstream cannot substitute another
 * reservation object inside the same tenant and project prefix.
 */
export function isExactDocumentUploadReservationPath(
  identity: DocumentUploadReservationPathIdentity
): boolean {
  if (identity.storagePath.includes('\\')) return false

  const segments = identity.storagePath.split('/')
  if (segments.length !== 3) return false

  const [tenantId, projectId, objectName] = segments
  const expectedObjectPrefix = `${identity.reservationId}-`
  if (
    tenantId !== identity.tenantId ||
    projectId !== identity.projectId ||
    typeof objectName !== 'string' ||
    !objectName.startsWith(expectedObjectPrefix)
  ) {
    return false
  }

  const fileName = objectName.slice(expectedObjectPrefix.length)
  return SAFE_STORAGE_FILE_NAME.test(fileName) && !fileName.includes('..')
}
