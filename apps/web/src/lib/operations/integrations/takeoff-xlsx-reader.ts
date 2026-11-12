import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
// The child process requires exceljs at run time. This import keeps the
// package (an external, see next.config.ts) in the files traced for every
// route that reads a workbook; nothing in this process calls it.
import 'exceljs'

/** A file over the parser's size limits; the message is safe to show. */
export class TakeoffTooLargeError extends Error {}

/** Too many workbooks are being read at once; the message is safe to show. */
export class TakeoffBusyError extends Error {
  constructor() {
    super('Other spreadsheets are being read right now. Try again in a few seconds.')
  }
}

// One workbook is read in one child process under these limits. The heap cap
// is what ExcelJS may hold (about 500 bytes for each row or cell of every
// sheet); the wall clock covers anything that makes it spin. A normal estimate
// needs a few megabytes and well under a second.
export const XLSX_READER_LIMITS = {
  heapMb: 512,
  wallClockMs: 15_000,
  // Reads at once in this process: bounds memory at concurrent x heapMb.
  concurrent: 2,
}

// Relative to the app directory, which is the working directory of `next dev`,
// `next start`, the standalone server and vitest. next.config.ts lists the
// same path in outputFileTracingIncludes so a deployed function has the file.
const WORKER_FILE = 'src/lib/operations/integrations/takeoff-xlsx-worker.cjs'
// The end of the child's stderr kept to tell a heap-limit crash from others.
const STDERR_TAIL = 4_096
const OUT_OF_MEMORY = /heap out of memory|Reached heap limit/i

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
type Outcome = { ok: true; read: XlsxSheetRead } | { ok: false; error: Error }

// Each slot is one child process that may still be running.
let activeReads = 0

/**
 * Reads one sheet in a child process and resolves with plain values. A thread
 * cannot be stopped while V8 runs a builtin loop, so the reader is a process
 * that is killed (SIGKILL) at the wall clock; its heap is capped with
 * --max-old-space-size. Rejects with TakeoffTooLargeError at either limit,
 * with TakeoffBusyError when too many reads are running, and with a plain
 * Error when ExcelJS cannot read the workbook or the process cannot start.
 * The promise settles, and the slot is released, only once the child is gone.
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
    let released = false
    const release = (outcome: Outcome) => {
      if (released) return
      released = true
      activeReads -= 1
      if (outcome.ok) resolve(outcome.read)
      else reject(outcome.error)
    }

    let child: ReturnType<typeof fork>
    try {
      child = fork(workerFile, [], {
        execArgv: [`--max-old-space-size=${limits.heapMb}`],
        // Structured clone, so dates and buffers cross as they are.
        serialization: 'advanced',
        // The parser of an untrusted file gets none of this server's secrets.
        env: { NODE_ENV: process.env.NODE_ENV },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      })
    } catch (error) {
      release({ ok: false, error: error instanceof Error ? error : new Error(String(error)) })
      return
    }

    // The first reason the read ended; the child is killed at once either way.
    let outcome: Outcome | undefined
    const stop = (reason: Outcome) => {
      outcome ??= reason
      child.kill('SIGKILL')
    }
    const timer = setTimeout(() => {
      stop({
        ok: false,
        error: new TakeoffTooLargeError(
          `The workbook took longer than ${Math.round(limits.wallClockMs / 1000)} seconds to read. Copy the BOQ sheet to a new workbook and try again.`,
        ),
      })
    }, limits.wallClockMs)

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL)
    })
    child.once('message', (reply: WorkerReply) => {
      stop(
        'error' in reply
          ? { ok: false, error: new Error(`The workbook could not be read: ${reply.error}`) }
          : { ok: true, read: reply },
      )
    })
    // A process that never started emits 'error' and no exit; one that did
    // start always ends in 'close', after its stderr is drained.
    child.once('error', (error) => {
      if (child.pid === undefined) {
        clearTimeout(timer)
        release({ ok: false, error })
      } else {
        stop({ ok: false, error })
      }
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      release(
        outcome ??
          (OUT_OF_MEMORY.test(stderr)
            ? {
                ok: false,
                error: new TakeoffTooLargeError(
                  `The workbook needs more than ${limits.heapMb} MB of memory to read. Copy the BOQ sheet to a new workbook and try again.`,
                ),
              }
            : {
                ok: false,
                error: new Error(`The workbook reader stopped unexpectedly (exit ${code ?? signal}).`),
              }),
      )
    })

    try {
      child.send({ ...request, bytes }, (error) => {
        if (error) stop({ ok: false, error })
      })
    } catch (error) {
      stop({ ok: false, error: error instanceof Error ? error : new Error(String(error)) })
    }
  })
}
