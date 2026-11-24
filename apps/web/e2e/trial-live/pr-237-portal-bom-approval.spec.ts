import { test } from '../base-test'
import { gateTrialLive, needsData } from '../helpers/trial-live'

gateTrialLive()

test(
  'portal BOM approval is offered only on approved BOMs, without unit cost',
  { tag: ['@pr-237', '@needs-data'] },
  async () => {
    // "Send to client" on an approved BOM still mints a /portal/bom/<token> link
    // (bom/[bomId]/portal-actions.ts), but only its sha256 is stored, it lasts 48 h and
    // minting emails the client, so no seed can leave a link for a later run. The
    // "not approved" half also needs a BOM that left approved after its link was minted.
    needsData('a legacy /portal/bom/<token> link for a BOM on the E2E project, one approved and one not')
  }
)
