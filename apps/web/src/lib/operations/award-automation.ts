import { db } from '@third-code-erp/database'
import {
  runSignedBomAward,
  type SignedBomAwardArgs,
  type AwardAutomationResult,
} from '@third-code-erp/operations/signed-bom-award'

export {
  lockSignedBomAwardScope,
  runSignedBomAward,
  selectSignedBomAwardLines,
  type SignedBomAwardLine,
  type SignedBomAwardArgs,
  type AwardAutomationResult,
} from '@third-code-erp/operations/signed-bom-award'

export async function runSignedBomAwardInTransaction(
  args: SignedBomAwardArgs
): Promise<AwardAutomationResult> {
  return db.transaction((tx) => runSignedBomAward(tx, args))
}
