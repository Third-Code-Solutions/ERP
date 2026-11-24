import { describe, expect, it } from 'vitest'
import { readExportError } from './export-csv-link'

describe('readExportError', () => {
  it('shows the row-limit refusal the export route answers with 413', async () => {
    const response = new Response(
      JSON.stringify({
        error: 'Export exceeds the 50,000-row limit. Narrow the filters and try again.',
      }),
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    )

    await expect(readExportError(response)).resolves.toBe(
      'Export exceeds the 50,000-row limit. Narrow the filters and try again.'
    )
  })

  it('falls back to a plain message when the body is not the route JSON', async () => {
    await expect(
      readExportError(new Response('<html>Bad gateway</html>', { status: 502 }))
    ).resolves.toBe('The export could not be downloaded. Try again.')
    await expect(
      readExportError(new Response(JSON.stringify({ error: '' }), { status: 500 }))
    ).resolves.toBe('The export could not be downloaded. Try again.')
  })
})
