import { test } from '@playwright/test'
import { gateTrialLive, needsData } from '../helpers/trial-live'

gateTrialLive()

test(
  'portal BOM approval is offered only on approved BOMs, without unit cost',
  { tag: ['@pr-237', '@needs-data'] },
  async () => {
    // /portal/bom/<token> only accepts legacy plaintext links. No screen mints one
    // (Send to client now issues a signing session), so the E2E tenant has none.
    needsData('a legacy /portal/bom/<token> link for a BOM on the E2E project, one approved and one not')
  }
)
