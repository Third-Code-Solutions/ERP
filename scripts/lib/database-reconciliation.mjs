export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => canonicalize(item))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    )
  }
  return value
}

export function recordKey(record, fields) {
  return fields.map((field) => String(record[field] ?? '')).join('\u001f')
}

export function diffRecords(leftRows, rightRows, fields) {
  const left = new Map(leftRows.map((row) => [recordKey(row, fields), row]))
  const right = new Map(rightRows.map((row) => [recordKey(row, fields), row]))
  const missingInRight = []
  const extraInRight = []
  const changed = []

  for (const [key, row] of left) {
    if (!right.has(key)) {
      missingInRight.push(row)
      continue
    }
    if (JSON.stringify(canonicalize(row)) !== JSON.stringify(canonicalize(right.get(key)))) {
      changed.push({ key, left: row, right: right.get(key) })
    }
  }
  for (const [key, row] of right) {
    if (!left.has(key)) extraInRight.push(row)
  }
  return { missingInRight, extraInRight, changed }
}

export function summarizeDiff(diff, limit = 20) {
  return {
    missingInRight: diff.missingInRight.length,
    extraInRight: diff.extraInRight.length,
    changed: diff.changed.length,
    samples: {
      missingInRight: diff.missingInRight.slice(0, limit),
      extraInRight: diff.extraInRight.slice(0, limit),
      changed: diff.changed.slice(0, limit),
    },
  }
}

export function hasDrift(diff) {
  return (
    diff.missingInRight > 0 ||
    diff.extraInRight > 0 ||
    diff.changed > 0
  )
}
