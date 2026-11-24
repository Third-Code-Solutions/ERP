/**
 * One CSV cell. Quoted only when it holds a quote, comma or line break; an
 * untrusted text value that starts like a spreadsheet formula gets an
 * apostrophe so Excel and Sheets show it as text.
 */
export function csvCell(value: string, untrustedText: boolean): string {
  const neutralized =
    untrustedText && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(neutralized)
    ? `"${neutralized.replace(/"/g, '""')}"`
    : neutralized
}
