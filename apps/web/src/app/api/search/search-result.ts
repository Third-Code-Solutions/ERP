import {
  universalSearchResultSchema,
  type UniversalSearchHit,
  type UniversalSearchResult,
} from '@third-code-erp/shared-types'
import type { SearchHitType } from './search-policy'

export function universalSearchResultFromSettled(
  queries: ReadonlyArray<{ type: SearchHitType }>,
  results: ReadonlyArray<PromiseSettledResult<UniversalSearchHit[]>>
): UniversalSearchResult {
  const failedTypes = results.flatMap((result, index) =>
    result.status === 'rejected' ? [queries[index]!.type] : []
  )
  const hits = results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  )

  return universalSearchResultSchema.parse({
    hits,
    status: failedTypes.length > 0 ? 'partial' : 'complete',
    failedTypes,
  })
}
