import { readdirSync, readFileSync } from 'node:fs'
import { parseCatalogueCsv, type CatalogueCsvRow } from './csv'

const FILE_NAME = /^\d{2}-([a-z-]+)\.csv$/
const dataDirectory = new URL('../../../../../data/catalogue/', import.meta.url)

/**
 * Test support: every row of data/catalogue/*.csv, parsed the way the seed
 * parses it, so a database test can say what the seeded rows must be. Shared
 * by the two catalogue database tests; app code must not import it, because a
 * deployed app has no data/ folder.
 */
export function readResearchFiles(): CatalogueCsvRow[] {
  return readdirSync(dataDirectory)
    .filter((name) => FILE_NAME.test(name))
    .sort()
    .flatMap((name) =>
      parseCatalogueCsv(readFileSync(new URL(name, dataDirectory), 'utf8'), {
        expectedTrade: FILE_NAME.exec(name)?.[1],
      }),
    )
}
