import { ConflictException, Logger } from '@nestjs/common'
import { resolveTaxRates, type Database } from '@third-code-erp/database'
import {
  TaxProfileOverlapError,
  type EffectiveTaxRates,
} from '@third-code-erp/shared-types'

const logger = new Logger('TaxRates')

/**
 * Effective tenant tax rates for a money write, read in the write's
 * transaction (spec tenancy C-1). An overlap of active profiles fails the
 * write closed with a 409 (AC-TEN-19).
 */
export async function resolveTaxRatesForWrite(
  transaction: Pick<Database, 'select'>,
  tenantId: string,
  at: Date
): Promise<EffectiveTaxRates> {
  try {
    return await resolveTaxRates(transaction, tenantId, at)
  } catch (error) {
    if (error instanceof TaxProfileOverlapError) {
      logger.error(error.message)
      throw new ConflictException(error.message)
    }
    throw error
  }
}
