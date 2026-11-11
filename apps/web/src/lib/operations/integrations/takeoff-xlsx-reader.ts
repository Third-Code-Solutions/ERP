import { existsSync } from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
// The worker thread requires exceljs at run time. This import keeps the
// package (an external, see next.config.ts) in the files traced for every
// route that reads a workbook; nothing on this thread calls it.
import 'exceljs'

/** A file over the parser's size limits; the message is safe to show. */
export class TakeoffTooLargeError extends Error {}

/** Too many workbooks are being read at once; the message is safe to show. */
export class TakeoffBusyError extends Error {
  constructor() {
    super('Other spreadsheets are being read right now. Try again in a few seconds.')
  }
}

// One workbook is read in one worker under these limits. The heap cap is what
// ExcelJS may hold (about 500 bytes for each row or cell of every sheet); the
// wall clock covers anything that makes it spin. A normal estimate needs a few
// megabytes and well under a second.
export const XLSX_READER_LIMITS = {
  heapMb: 512,
  wallClockMs: 15_000,
  // Workers at once in this process: bounds memory at concurrent x heapMb.
  concurrent: 2,
}

// Relative to the app directory, which is the working directory of `next dev`,
// `next start`, the standalone server and vitest. next.config.ts lists the
// same path in outputFileTracingIncludes so a deployed function has the file.
const WORKER_FILE = 'src/lib/operations/integrations/takeoff-xlsx-worker.cjs'

export interface XlsxSheetRequest {
  /** Worksheet name; the first sheet when absent. */
  sheet?: string
  /** Last sheet row to read; content below it refuses the sheet. */
  lastRow: number
  maxColumns: number
  /** Cell text is cut here. */
  maxText: number
  /** Total text characters the rows read may hold. */
  maxGridText: number
  /** Worksheet XML nodes ExcelJS must not parse. */
  ignoreNodes: string[]
}

export type XlsxSheetRead =
  | { sheets: string[]; sheet: null }
  | { sheets: string[]; sheet: string; refused: 'TOO_MANY_ROWS' | 'TOO_MUCH_TEXT' }
  | { sheets: string[]; sheet: string; refused: 'TOO_WIDE'; columns: number }
  | { sheets: string[]; sheet: string; grid: unknown[][]; hiddenRows: number[] }

type WorkerReply = XlsxSheetRead | { error: string }

let activeReads = 0

/**
 * Reads one sheet in a worker thread and resolves with plain values. Rejects
 * with TakeoffTooLargeError when the worker hits the heap cap or the wall
 * clock (it is terminated either way, and the request thread never blocks),
 * with TakeoffBusyError when too many reads are running, and with a plain
 * Error when ExcelJS cannot read the workbook.
 */
export function readXlsxSheet(
  bytes: Uint8Array,
  request: XlsxSheetRequest,
  limits = XLSX_READER_LIMITS,
): Promise<XlsxSheetRead> {
  const workerFile = path.join(process.cwd(), WORKER_FILE)
  if (!existsSync(workerFile)) {
    return Promise.reject(new Error(`Workbook reader is not installed: ${WORKER_FILE} is missing.`))
  }
  if (activeReads >= limits.concurrent) return Promise.reject(new TakeoffBusyError())

  activeReads += 1
  return new Promise<XlsxSheetRead>((resolve, reject) => {
    const worker = new Worker(workerFile, {
      workerData: { ...request, bytes },
      resourceLimits: { maxOldGenerationSizeMb: limits.heapMb },
    })
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = (finish: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      activeReads -= 1
      void worker.terminate()
      finish()
    }
    timer = setTimeout(() => {
      settle(() =>
        reject(
          new TakeoffTooLargeError(
            `The workbook took longer than ${Math.round(limits.wallClockMs / 1000)} seconds to read. Copy the BOQ sheet to a new workbook and try again.`,
          ),
        ),
      )
    }, limits.wallClockMs)

    worker.once('message', (reply: WorkerReply) => {
      settle(() =>
        'error' in reply
          ? reject(new Error(`The workbook could not be read: ${reply.error}`))
          : resolve(reply),
      )
    })
    worker.once('error', (error: NodeJS.ErrnoException) => {
      settle(() =>
        reject(
          error.code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? new TakeoffTooLargeError(
                `The workbook needs more than ${limits.heapMb} MB of memory to read. Copy the BOQ sheet to a new workbook and try again.`,
              )
            : error,
        ),
      )
    })
    worker.once('exit', (code) => {
      settle(() => reject(new Error(`The workbook reader stopped unexpectedly (exit ${code}).`)))
    })
  })
}
