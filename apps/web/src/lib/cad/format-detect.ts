// CAD format detection by magic bytes.
//
// File extensions lie. Some CAD users save DXF text content with a .dwg
// extension (and vice versa). This util inspects the first bytes of the file
// to determine the actual format on disk.
//
// References:
//   DWG header — bytes 0..5 are ASCII "AC1xxx" version code
//     AC1014 = R14, AC1018 = 2004, AC1024 = 2010, AC1027 = 2013, AC1032 = 2018
//   DXF text — starts with "  0\nSECTION" or "0\r\nSECTION" (sometimes with
//     UTF-8 BOM EF BB BF). Lines come in pairs of "<group code>\n<value>".

export type DetectedFormat = 'dxf' | 'dwg' | 'unknown'

export interface FormatDetectionResult {
  format: DetectedFormat
  /** ASCII version tag from DWG header, e.g. "AC1027". null for DXF. */
  dwgVersion: string | null
  /** True when the file extension and detected format disagree. */
  mismatch: boolean
}

const DWG_MAGIC_PREFIX = 'AC10' // covers AC1012 (R13) through AC1032 (2018)
const DXF_MARKERS = ['0\r\nSECTION', '0\nSECTION']

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

export function detectCadFormat(
  bytes: Uint8Array,
  fileExtension: string | null
): FormatDetectionResult {
  // Look at the first 6 bytes for DWG version tag, then a larger window for DXF
  if (bytes.length < 6) {
    return { format: 'unknown', dwgVersion: null, mismatch: false }
  }

  const headerAscii = new TextDecoder('ascii', { fatal: false }).decode(
    bytes.subarray(0, 6)
  )

  if (headerAscii.startsWith(DWG_MAGIC_PREFIX)) {
    const ext = fileExtension?.toLowerCase() ?? null
    return {
      format: 'dwg',
      dwgVersion: headerAscii,
      mismatch: ext !== null && ext !== 'dwg',
    }
  }

  // Probe up to 4 KB for DXF marker. The "  0\nSECTION" pattern can be a few
  // bytes in (after whitespace, BOM, comments).
  const sample = stripBom(
    new TextDecoder('utf-8', { fatal: false }).decode(
      bytes.subarray(0, Math.min(bytes.length, 4096))
    )
  ).trim()

  for (const marker of DXF_MARKERS) {
    if (sample.startsWith(marker) || sample.includes('\nSECTION')) {
      const ext = fileExtension?.toLowerCase() ?? null
      return {
        format: 'dxf',
        dwgVersion: null,
        mismatch: ext !== null && ext !== 'dxf',
      }
    }
  }

  return { format: 'unknown', dwgVersion: null, mismatch: false }
}

export function fileExtensionOf(fileName: string): string | null {
  const idx = fileName.lastIndexOf('.')
  if (idx < 0) return null
  return fileName.slice(idx + 1).toLowerCase()
}
