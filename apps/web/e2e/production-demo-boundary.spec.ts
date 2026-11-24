import { test } from './fixtures'
import { assertProductionDemoBoundary } from './helpers/production-demo-boundary'

test('production role and project fixtures belong to the dedicated demo tenant', async () => {
  test.skip(
    process.env.E2E_PRODUCTION_DEMO_BOUNDARY !== '1',
    'Enable only in the protected production promotion workflow.'
  )
  await assertProductionDemoBoundary()
})
