'use strict'
// Reads one sheet of an .xlsx with ExcelJS in a child process (see
// takeoff-xlsx-reader.ts), never in the server process. A tiny file can make
// ExcelJS burn CPU or memory in ways no check in front of it has kept up with,
// so the reader caps the process heap and kills the process at a wall-clock
// limit. Plain CommonJS on purpose: the same file runs under vitest, `next
// dev` and a production build, where next.config.ts ships it with the route.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS file the reader starts by path */
const ExcelJS = require('exceljs')

/** A cell value the server process can use as is: small, plain and bounded. */
function plainValue(value, maxText) {
  if (value == null) return null
  if (typeof value === 'string') return value.length > maxText ? value.slice(0, maxText) : value
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value
  if (typeof value !== 'object') return null
  if ('formula' in value || 'sharedFormula' in value) {
    return value.result === undefined
      ? { formula: true }
      : { formula: true, result: plainValue(value.result, maxText) }
  }
  if (Array.isArray(value.richText)) {
    // A shared string can hold millions of runs; join only what is read. The
    // runs are counted as well as the characters: empty runs never add up to
    // maxText, and every cell that uses the string would walk all of them.
    let text = ''
    let runs = 0
    for (const part of value.richText) {
      if (part && typeof part.text === 'string') text += part.text
      runs += 1
      if (text.length >= maxText || runs >= maxText) break
    }
    return text.slice(0, maxText)
  }
  if ('text' in value) return plainValue(value.text, maxText)
  if (typeof value.error === 'string') return { error: value.error.slice(0, 32) }
  return null
}

function cellValue(cell, maxText) {
  if (!cell.isMerged || cell.master.address === cell.address) return plainValue(cell.value, maxText)
  // A merged follower is blank, except straight below its master: text merged
  // down a column (a Division or Location) belongs to every row it spans.
  // Numbers are never filled down; one merged amount is not three amounts.
  const value = cell.master.col === cell.col ? plainValue(cell.master.value, maxText) : null
  return typeof value === 'string' ? value : null
}

async function readSheet({ bytes, sheet, lastRow, maxColumns, maxText, maxGridText, ignoreNodes }) {
  const workbook = new ExcelJS.Workbook()
  // ExcelJS expands every defined-name range into one object per cell when it
  // applies the loaded workbook. The import never reads names, so an inert
  // holder takes them instead.
  Object.assign(workbook, { _definedNames: { model: [] } })
  await workbook.xlsx.load(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { ignoreNodes })

  const sheets = workbook.worksheets.map((worksheet) => worksheet.name)
  const worksheet = sheet ? workbook.getWorksheet(sheet) : workbook.worksheets[0]
  if (!worksheet) return { sheets, sheet: null }
  const name = worksheet.name
  if (worksheet.columnCount > maxColumns) {
    return { sheets, sheet: name, refused: 'TOO_WIDE', columns: worksheet.columnCount }
  }

  const grid = []
  const hiddenRows = []
  let text = 0
  let refused = null
  worksheet.eachRow((row, rowNumber) => {
    if (refused) return
    if (rowNumber > lastRow) {
      refused = 'TOO_MANY_ROWS'
      return
    }
    const cells = []
    row.eachCell((cell, column) => {
      const value = cellValue(cell, maxText)
      if (typeof value === 'string') text += value.length
      cells[column - 1] = value
    })
    if (text > maxGridText) refused = 'TOO_MUCH_TEXT'
    grid[rowNumber - 1] = Array.from(cells, (value) => (value === undefined ? null : value))
    if (row.hidden) hiddenRows.push(rowNumber)
  })
  return refused ? { sheets, sheet: name, refused } : { sheets, sheet: name, grid, hiddenRows }
}

// One request per process; the reader kills the process once it has the reply.
process.once('message', (request) => {
  readSheet(request).then(
    (result) => process.send(result),
    (error) => process.send({ error: String((error && error.message) || error).slice(0, 500) }),
  )
})
