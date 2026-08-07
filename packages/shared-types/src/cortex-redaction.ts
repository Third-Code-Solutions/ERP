/** Remove common direct identifiers before Cortex text leaves ERP Core. */
const CORTEX_REDACTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    '[email redacted]',
  ],
  [
    /\b(?:TIN|tax identification number)\s*[:#-]?\s*\d{3}[- ]?\d{3}[- ]?\d{3}(?:[- ]?\d{3})?\b/gi,
    '[tax id redacted]',
  ],
  [
    /\b\d{3}[- ]\d{3}[- ]\d{3}(?:[- ]\d{3})?\b/g,
    '[tax id redacted]',
  ],
  [/(?:\+63|0)9\d{9}\b/g, '[phone redacted]'],
]

export function redactCortexText(value: string): string {
  return CORTEX_REDACTION_RULES.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value
  )
}
