export interface MasterScheduleTask {
  name: string
  start_date: string
  finish_date: string
  predecessor_index: number | null
  planned_pct_curve: number[]
}

export interface MasterScheduleImportRejection {
  row: number
  reason: string
}

export interface MasterScheduleImportPreview {
  totalRows: number
  headerDetected: boolean
  tasks: MasterScheduleTask[]
  rejectedRows: MasterScheduleImportRejection[]
}

/** Minimal CSV parser for the five-column L1 master schedule format. */
function parseCsv(text: string): { rows: string[][]; error?: string } {
  const rows: string[][] = []
  let cur: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      cur.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cur.push(cell)
      if (cur.some((value) => value.trim() !== '')) rows.push(cur)
      cur = []
      cell = ''
      continue
    }
    cell += ch
  }
  if (inQuotes) return { rows, error: 'CSV contains an unterminated quoted cell.' }
  if (cell !== '' || cur.length > 0) {
    cur.push(cell)
    if (cur.some((value) => value.trim() !== '')) rows.push(cur)
  }
  return { rows }
}

function parsePctCurve(raw: string): { values: number[]; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { values: [] }
  let values: number[]
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) return { values: [], error: 'planned_pct_curve must be a JSON array or pipe-separated percentages.' }
    values = parsed.map((value) => (typeof value === 'number' ? value : Number(value)))
  } catch {
    values = trimmed.split('|').map((value) => Number(value.trim()))
  }
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
    return { values: [], error: 'planned_pct_curve values must be finite percentages from 0 to 100.' }
  }
  for (let index = 1; index < values.length; index++) {
    if ((values[index] ?? 0) < (values[index - 1] ?? 0)) {
      return { values: [], error: 'planned_pct_curve must be cumulative and non-decreasing.' }
    }
  }
  return { values }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0))
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 0) - 1 && date.getUTCDate() === day
}

function addRejection(rejections: Map<number, string>, row: number, reason: string): void {
  if (!rejections.has(row)) rejections.set(row, reason)
}

function findPredecessorCycles(tasks: Array<{ predecessor_index: number | null }>): Set<number> {
  const cycleRows = new Set<number>()
  for (let start = 0; start < tasks.length; start++) {
    const path: number[] = []
    const visited = new Map<number, number>()
    let current: number | null = start
    while (current !== null && current >= 0 && current < tasks.length) {
      const prior = visited.get(current)
      if (prior !== undefined) {
        for (const row of path.slice(prior)) cycleRows.add(row)
        break
      }
      visited.set(current, path.length)
      path.push(current)
      current = tasks[current]?.predecessor_index ?? null
    }
  }
  return cycleRows
}

/** Pure parser used by preview and commit paths. It never mutates database state. */
export function parseMasterScheduleCsv(text: string): MasterScheduleImportPreview {
  const parsed = parseCsv(text)
  if (parsed.error) {
    return { totalRows: 0, headerDetected: false, tasks: [], rejectedRows: [{ row: 1, reason: parsed.error }] }
  }
  const rows = parsed.rows
  if (rows.length === 0) return { totalRows: 0, headerDetected: false, tasks: [], rejectedRows: [{ row: 1, reason: 'CSV contains no task rows.' }] }

  const headerDetected = rows[0]?.[0]?.trim().toLowerCase() === 'name'
  const dataRows = headerDetected ? rows.slice(1) : rows
  const rejections = new Map<number, string>()
  const parsedTasks: Array<{ row: number; task: MasterScheduleTask }> = []

  for (let index = 0; index < dataRows.length; index++) {
    const rowNumber = headerDetected ? index + 2 : index + 1
    const cols = dataRows[index] ?? []
    if (cols.length !== 5) {
      addRejection(rejections, rowNumber, 'Expected exactly 5 columns: name, start_date, finish_date, predecessor_index, planned_pct_curve.')
      continue
    }
    const name = cols[0]?.trim() ?? ''
    const startDate = cols[1]?.trim() ?? ''
    const finishDate = cols[2]?.trim() ?? ''
    const predecessorRaw = cols[3]?.trim() ?? ''
    const curveRaw = cols[4] ?? ''
    if (!name) addRejection(rejections, rowNumber, 'Task name is required.')
    else if (name.length > 200) addRejection(rejections, rowNumber, 'Task name must be 200 characters or fewer.')
    if (!isCalendarDate(startDate)) addRejection(rejections, rowNumber, 'Start date must be a real YYYY-MM-DD calendar date.')
    if (!isCalendarDate(finishDate)) addRejection(rejections, rowNumber, 'Finish date must be a real YYYY-MM-DD calendar date.')
    if (isCalendarDate(startDate) && isCalendarDate(finishDate) && finishDate < startDate) addRejection(rejections, rowNumber, 'Finish date must be on or after start date.')

    let predecessorIndex: number | null = null
    if (predecessorRaw && predecessorRaw.toLowerCase() !== 'null') {
      const parsedIndex = Number(predecessorRaw)
      if (!Number.isInteger(parsedIndex) || parsedIndex < 0 || parsedIndex >= dataRows.length || parsedIndex === index) {
        addRejection(rejections, rowNumber, 'predecessor_index must reference a different task row in this file (zero-based).')
      } else predecessorIndex = parsedIndex
    }

    const curve = parsePctCurve(curveRaw)
    if (curve.error) addRejection(rejections, rowNumber, curve.error)
    if (!rejections.has(rowNumber)) {
      parsedTasks.push({ row: rowNumber, task: { name, start_date: startDate, finish_date: finishDate, predecessor_index: predecessorIndex, planned_pct_curve: curve.values } })
    }
  }

  const allTasks: Array<{ predecessor_index: number | null }> = dataRows.map((_, index) => {
    const row = dataRows[index] ?? []
    const raw = row[3]?.trim() ?? ''
    const candidate = raw && raw.toLowerCase() !== 'null' && Number.isInteger(Number(raw)) ? Number(raw) : null
    const predecessorIndex = candidate !== null && candidate >= 0 && candidate < dataRows.length && candidate !== index ? candidate : null
    return { predecessor_index: predecessorIndex }
  })
  for (const index of findPredecessorCycles(allTasks)) {
    const rowNumber = headerDetected ? index + 2 : index + 1
    addRejection(rejections, rowNumber, 'Predecessor dependencies contain a cycle.')
  }

  return {
    totalRows: dataRows.length,
    headerDetected,
    tasks: parsedTasks.filter(({ row }) => !rejections.has(row)).map(({ task }) => task),
    rejectedRows: [...rejections.entries()].sort(([a], [b]) => a - b).map(([row, reason]) => ({ row, reason })),
  }
}

export function formatImportRejections(rejections: MasterScheduleImportRejection[]): string {
  return rejections.slice(0, 5).map(({ row, reason }) => `Row ${row}: ${reason}`).join(' ')
    + (rejections.length > 5 ? ` ${rejections.length - 5} more row(s) rejected.` : '')
}
