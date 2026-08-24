import type { DocumentIntakeDocumentType } from '@third-code-erp/shared-types'

/** Keeps every document creation path on the same deterministic classification. */
export function classifyDocumentType(
  fileName: string,
  mimeType: string
): DocumentIntakeDocumentType {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (extension === 'dxf' || extension === 'dwg') return 'dxf'
  if (extension === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (
    mimeType.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(extension)
  ) {
    return 'image'
  }
  return 'other'
}
