import { createHash } from 'node:crypto'
import { DOMParser } from '@xmldom/xmldom'
import {
  MS_PROJECT_XML_2007_NAMESPACE,
  MS_PROJECT_XML_DISCLOSURES,
  MS_PROJECT_XML_MAX_DECODED_BYTES,
  MS_PROJECT_XML_MAX_ISSUES,
  MS_PROJECT_XML_MAX_TASKS,
  MS_PROJECT_XML_MAX_XML_DEPTH,
  MS_PROJECT_XML_MAX_XML_ELEMENTS,
  MS_PROJECT_XML_NAMESPACE,
  MS_PROJECT_XML_PARSER_VERSION,
  msProjectXmlBase64Schema,
  msProjectXmlFileNameSchema,
  msProjectXmlPreviewSchema,
  type MsProjectXmlDateEvidence,
  type MsProjectXmlIssue,
  type MsProjectXmlPreview,
  type MsProjectXmlPreviewTask,
} from '@third-code-erp/shared-types'

const XML_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/
const XML_OUTLINE_NUMBER = /^[1-9]\d*(?:\.[1-9]\d*)*$/
const XML_INTEGER = /^[+-]?\d+$/
const XML_BOOLEAN = /^(?:0|1|true|false)$/
const FORBIDDEN_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/i

export type MsProjectXmlSource = {
  sourceBase64: string
  fileName?: string | null
}

type RawPredecessor = {
  predecessorUid: number
  typeCode: number
  crossProject: boolean
  crossProjectName: string | null
  linkLag: number
  lagFormat: number | null
}

type RawTask = {
  index: number
  sourceUid: number
  sourceId: number | null
  outlineNumber: string | null
  outlineLevel: number
  name: string
  isSummary: boolean
  sourceStart: MsProjectXmlDateEvidence
  sourceFinish: MsProjectXmlDateEvidence
  rawPredecessor: RawPredecessor | null
  parentSourceUid: number | null
  outlinePath: string[]
}

class XmlParserSignal extends Error {
  constructor(readonly level: 'warning' | 'error', message: string) {
    super(message)
    this.name = 'XmlParserSignal'
  }
}

function boundedText(value: unknown, fallback: string): string {
  const normalized = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return (normalized || fallback).slice(0, 500)
}

function addIssue(target: MsProjectXmlIssue[], issue: MsProjectXmlIssue): void {
  if (target.length < MS_PROJECT_XML_MAX_ISSUES) target.push(issue)
}

function makeIssue(code: MsProjectXmlIssue['code'], path: string, message: string, severity: MsProjectXmlIssue['severity'] = 'error'): MsProjectXmlIssue {
  return { code, path: path.slice(0, 200), message: boundedText(message, 'The XML source could not be imported.'), severity }
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1
}

function localName(element: Element): string {
  if (element.localName) return element.localName
  const separator = element.nodeName.indexOf(':')
  return separator >= 0 ? element.nodeName.slice(separator + 1) : element.nodeName
}

function elementChildren(parent: Node): Element[] {
  const elements: Element[] = []
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const child = parent.childNodes.item(index)
    if (child && isElement(child)) elements.push(child)
  }
  return elements
}

function directChildren(parent: Element, name: string, namespace: string): Element[] {
  return elementChildren(parent).filter((child) => child.namespaceURI === namespace && localName(child) === name)
}

function directText(element: Element): string {
  let value = ''
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes.item(index)
    if (!child) continue
    if (child.nodeType === 3 || child.nodeType === 4) value += child.nodeValue ?? ''
  }
  return value.trim()
}

function readOptionalText(parent: Element, name: string, namespace: string, path: string, issues: MsProjectXmlIssue[]): string | null {
  const matches = directChildren(parent, name, namespace)
  if (matches.length > 1) addIssue(issues, makeIssue('XML_PARSE_ERROR', path, `${name} must occur at most once.`))
  const first = matches[0]
  if (!first) return null
  if (elementChildren(first).length > 0) {
    addIssue(issues, makeIssue('XML_PARSE_ERROR', path, `${name} must contain text only.`))
    return null
  }
  const value = directText(first)
  if (value.length > 1_000) addIssue(issues, makeIssue('XML_PARSE_ERROR', path, `${name} is too long.`))
  return value || null
}

function parseInteger(value: string | null, path: string, issues: MsProjectXmlIssue[], options: { required: boolean; min: number; max: number; missingCode?: MsProjectXmlIssue['code']; invalidCode?: MsProjectXmlIssue['code'] }): number | null {
  if (value === null) {
    if (options.required) addIssue(issues, makeIssue(options.missingCode ?? 'XML_PARSE_ERROR', path, 'An integer value is required.'))
    return null
  }
  if (!XML_INTEGER.test(value)) {
    addIssue(issues, makeIssue(options.invalidCode ?? 'XML_PARSE_ERROR', path, 'Use a decimal integer without exponent or whitespace.'))
    return null
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < options.min || parsed > options.max) {
    addIssue(issues, makeIssue(options.invalidCode ?? 'XML_PARSE_ERROR', path, `Integer must be between ${options.min} and ${options.max}.`))
    return null
  }
  return parsed
}

function parseBoolean(value: string | null, path: string, issues: MsProjectXmlIssue[], defaultValue: boolean): boolean {
  if (value === null) return defaultValue
  if (!XML_BOOLEAN.test(value)) {
    addIssue(issues, makeIssue('UNSUPPORTED_TASK', path, 'Boolean values must be 0, 1, true, or false.'))
    return defaultValue
  }
  return value === '1' || value === 'true'
}

function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const parsed = new Date(0)
  parsed.setUTCHours(0, 0, 0, 0)
  parsed.setUTCFullYear(year, month - 1, day)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function parseDateEvidence(value: string | null, path: string, issues: MsProjectXmlIssue[]): MsProjectXmlDateEvidence | null {
  if (!value) {
    addIssue(issues, makeIssue('TASK_DATE_MISSING', path, 'Start and Finish are required for every imported task.'))
    return null
  }
  if (value.length > 64) {
    addIssue(issues, makeIssue('TASK_DATE_INVALID', path, 'Date/time values may not exceed 64 characters.'))
    return null
  }
  const match = XML_DATE_TIME.exec(value)
  if (!match || !isRealCalendarDate(value.slice(0, 10))) {
    addIssue(issues, makeIssue('TASK_DATE_INVALID', path, 'Use a complete XML dateTime with a real calendar date.'))
    return null
  }
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  if (hour > 23 || minute > 59 || second > 59) {
    addIssue(issues, makeIssue('TASK_DATE_INVALID', path, 'Use valid hour, minute, and second values.'))
    return null
  }
  const timezone = match[8]
  if (timezone && timezone !== 'Z') {
    const offsetMatch = /^[+-](\d{2}):(\d{2})$/.exec(timezone)
    const offsetHour = Number(offsetMatch?.[1] ?? -1)
    const offsetMinute = Number(offsetMatch?.[2] ?? -1)
    if (!offsetMatch || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      addIssue(issues, makeIssue('TASK_DATE_INVALID', path, 'Use a valid XML timezone offset.'))
      return null
    }
  }
  return { raw: value, calendarDate: value.slice(0, 10) }
}

function parseOutlineNumber(value: string | null, path: string, issues: MsProjectXmlIssue[]): string[] | null {
  if (!value) return null
  if (value.length > 255 || !XML_OUTLINE_NUMBER.test(value)) {
    addIssue(issues, makeIssue('OUTLINE_NUMBER_INVALID', path, 'OutlineNumber must contain numeric segments separated by dots.'))
    return null
  }
  return value.split('.')
}

function parseRawPredecessor(element: Element, namespace: string, path: string, issues: MsProjectXmlIssue[]): RawPredecessor | null {
  const predecessorUid = parseInteger(readOptionalText(element, 'PredecessorUID', namespace, `${path}.PredecessorUID`, issues), `${path}.PredecessorUID`, issues, { required: true, min: 1, max: 2_147_483_647, missingCode: 'PREDECESSOR_UID_MISSING', invalidCode: 'PREDECESSOR_UID_INVALID' })
  const typeCode = parseInteger(readOptionalText(element, 'Type', namespace, `${path}.Type`, issues), `${path}.Type`, issues, { required: true, min: 0, max: 3 })
  const crossProject = parseBoolean(readOptionalText(element, 'CrossProject', namespace, `${path}.CrossProject`, issues), `${path}.CrossProject`, issues, false)
  const crossProjectName = readOptionalText(element, 'CrossProjectName', namespace, `${path}.CrossProjectName`, issues)
  const linkLag = parseInteger(readOptionalText(element, 'LinkLag', namespace, `${path}.LinkLag`, issues), `${path}.LinkLag`, issues, { required: false, min: -2_147_483_648, max: 2_147_483_647 }) ?? 0
  const lagFormat = parseInteger(readOptionalText(element, 'LagFormat', namespace, `${path}.LagFormat`, issues), `${path}.LagFormat`, issues, { required: false, min: 0, max: 255 })

  if (typeCode !== null && typeCode !== 1) addIssue(issues, makeIssue('UNSUPPORTED_DEPENDENCY_TYPE', `${path}.Type`, 'Only explicit finish-to-start predecessor links are supported.'))
  if (linkLag !== 0) addIssue(issues, makeIssue('DEPENDENCY_LAG_NOT_SUPPORTED', `${path}.LinkLag`, 'Lagged predecessor links are not representable in the current schedule register.'))
  if (crossProject || crossProjectName) addIssue(issues, makeIssue('EXTERNAL_DEPENDENCY', path, 'External predecessor links are not supported.'))
  if (predecessorUid === null || typeCode === null) return null
  return { predecessorUid, typeCode, crossProject, crossProjectName, linkLag, lagFormat }
}

function compareLocalDateTime(left: MsProjectXmlDateEvidence, right: MsProjectXmlDateEvidence): number {
  const leftLocal = left.raw.slice(0, 19)
  const rightLocal = right.raw.slice(0, 19)
  return leftLocal < rightLocal ? -1 : leftLocal > rightLocal ? 1 : 0
}

function inspectBounds(root: Element, namespace: string, issues: MsProjectXmlIssue[]): boolean {
  const stack: Array<{ element: Element; depth: number }> = [{ element: root, depth: 1 }]
  let elementCount = 0
  let valid = true
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    elementCount += 1
    if (elementCount > MS_PROJECT_XML_MAX_XML_ELEMENTS) {
      addIssue(issues, makeIssue('XML_ELEMENT_COUNT_EXCEEDED', 'Project', `XML contains more than ${MS_PROJECT_XML_MAX_XML_ELEMENTS} elements.`))
      valid = false
      break
    }
    if (current.depth > MS_PROJECT_XML_MAX_XML_DEPTH) {
      addIssue(issues, makeIssue('XML_DEPTH_EXCEEDED', 'Project', `XML nesting may not exceed ${MS_PROJECT_XML_MAX_XML_DEPTH} elements.`))
      valid = false
      break
    }
    if (current.element.namespaceURI !== namespace) {
      addIssue(issues, makeIssue('ROOT_NAMESPACE_INVALID', current.element.nodeName, 'Every XML element must use the Project namespace.'))
      valid = false
      break
    }
    if (current.element !== root && localName(current.element) === 'Project') {
      addIssue(issues, makeIssue('UNSUPPORTED_TASK', current.element.nodeName, 'Nested Project collections are not supported; tasks must belong to the direct Project.Tasks collection.'))
      valid = false
    }
    if (localName(current.element) === 'Task') {
      const parent = current.element.parentNode
      const grandParent = parent?.parentNode
      if (!parent || !isElement(parent) || localName(parent) !== 'Tasks' || grandParent !== root) {
        addIssue(issues, makeIssue('UNSUPPORTED_TASK', current.element.nodeName, 'Project-namespace Task elements must belong to the direct Project.Tasks collection.'))
        valid = false
      }
    }
    const children = elementChildren(current.element)
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      if (child) stack.push({ element: child, depth: current.depth + 1 })
    }
  }
  return valid
}

function previewShell(fileName: string | null, sourceHash: string | null, sourceBytes: number, issues: MsProjectXmlIssue[], notices: MsProjectXmlIssue[], overrides?: Partial<Pick<MsProjectXmlPreview, 'projectName' | 'tasks' | 'omittedSummaryTask'>>): MsProjectXmlPreview {
  const tasks = overrides?.tasks ?? []
  return msProjectXmlPreviewSchema.parse({
    sourceHash,
    sourceBytes,
    parserVersion: MS_PROJECT_XML_PARSER_VERSION,
    fileName,
    projectName: overrides?.projectName ?? '',
    tasks,
    issues,
    notices,
    disclosures: [...MS_PROJECT_XML_DISCLOSURES],
    canImport: issues.length === 0 && sourceHash !== null && tasks.length > 0,
    omittedSummaryTask: overrides?.omittedSummaryTask ?? null,
  })
}

function normalizeFileName(fileName: string | null | undefined): string | null {
  if (fileName === null || fileName === undefined) return null
  const parsed = msProjectXmlFileNameSchema.safeParse(fileName)
  return parsed.success ? parsed.data : null
}

function decodeSource(sourceBase64: string): { bytes: Buffer; xml: string } | { issue: MsProjectXmlIssue } {
  const parsed = msProjectXmlBase64Schema.safeParse(sourceBase64)
  if (!parsed.success) {
    const tooLarge = sourceBase64.length > Math.ceil(MS_PROJECT_XML_MAX_DECODED_BYTES / 3) * 4
    return { issue: makeIssue(tooLarge ? 'SOURCE_TOO_LARGE' : 'INVALID_BASE64', 'sourceBase64', tooLarge ? 'Decoded XML source must be 1 MiB or smaller.' : 'Source must be canonical base64 without whitespace or URL-safe characters.') }
  }
  const bytes = Buffer.from(sourceBase64, 'base64')
  if (bytes.byteLength > MS_PROJECT_XML_MAX_DECODED_BYTES || bytes.toString('base64') !== sourceBase64) {
    return { issue: makeIssue(bytes.byteLength > MS_PROJECT_XML_MAX_DECODED_BYTES ? 'SOURCE_TOO_LARGE' : 'INVALID_BASE64', 'sourceBase64', bytes.byteLength > MS_PROJECT_XML_MAX_DECODED_BYTES ? 'Decoded XML source must be 1 MiB or smaller.' : 'Source must use canonical base64 padding.') }
  }
  let xml: string
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { issue: makeIssue('INVALID_UTF8', 'sourceBase64', 'Source bytes must be valid UTF-8 XML.') }
  }
  return { bytes, xml }
}

function parseDocument(xml: string): Document | { issue: MsProjectXmlIssue } {
  if (FORBIDDEN_DECLARATION.test(xml)) return { issue: makeIssue('DTD_NOT_ALLOWED', 'document', 'DTD and entity declarations are not accepted.') }
  if (hasInvalidXmlCodePoint(xml) || hasInvalidNumericCharacterReference(xml)) return { issue: makeIssue('XML_PARSE_ERROR', 'document', 'XML contains a character that is not valid in XML 1.0.') }
  if (hasNonWhitespaceOutsideRoot(xml)) return { issue: makeIssue('XML_PARSE_ERROR', 'document', 'Only XML markup and whitespace may occur outside the Project root.') }
  try {
    const parser = new DOMParser({
      errorHandler: {
        warning: (message: unknown) => { throw new XmlParserSignal('warning', String(message)) },
        error: (message: unknown) => { throw new XmlParserSignal('error', String(message)) },
        fatalError: (message: unknown) => { throw new XmlParserSignal('error', String(message)) },
      },
    })
    return parser.parseFromString(xml, 'application/xml')
  } catch (error) {
    if (error instanceof XmlParserSignal && error.level === 'warning') return { issue: makeIssue('XML_WARNING', 'document', 'XML parser warning; source rejected.') }
    return { issue: makeIssue('XML_PARSE_ERROR', 'document', 'XML parser rejected the source.') }
  }
}

function isValidXmlCodePoint(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0d || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff)
}

function hasInvalidXmlCodePoint(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.codePointAt(index)
    if (code === undefined || !isValidXmlCodePoint(code)) return true
    if (code > 0xffff) index += 1
  }
  return false
}

function hasInvalidNumericCharacterReference(value: string): boolean {
  const references = value.matchAll(/&#(?:x([0-9a-f]+)|([0-9]+));/gi)
  for (const reference of references) {
    const code = reference[1] ? Number.parseInt(reference[1], 16) : Number.parseInt(reference[2]!, 10)
    if (!Number.isSafeInteger(code) || !isValidXmlCodePoint(code)) return true
  }
  return false
}

function hasNonWhitespaceOutsideRoot(xml: string): boolean {
  let cursor = 0
  let depth = 0
  let rootSeen = false
  while (cursor < xml.length) {
    if (xml[cursor] !== '<') {
      const nextMarkup = xml.indexOf('<', cursor)
      const end = nextMarkup < 0 ? xml.length : nextMarkup
      if (depth === 0 && xml.slice(cursor, end).trim()) return true
      cursor = end
      continue
    }
    if (xml.startsWith('<!--', cursor)) {
      const end = xml.indexOf('-->', cursor + 4)
      if (end < 0) return true
      const commentBody = xml.slice(cursor + 4, end)
      if (commentBody.includes('--') || commentBody.endsWith('-')) return true
      cursor = end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', cursor)) {
      const end = xml.indexOf(']]>', cursor + 9)
      if (end < 0) return true
      if (depth === 0) return true
      cursor = end + 3
      continue
    }
    if (xml.startsWith('<?', cursor)) {
      const end = xml.indexOf('?>', cursor + 2)
      if (end < 0) return true
      cursor = end + 2
      continue
    }
    let quote: string | null = null
    let end = cursor + 1
    for (; end < xml.length; end += 1) {
      const character = xml[end]
      if (quote) {
        if (character === quote) quote = null
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '>') {
        break
      }
    }
    if (end >= xml.length || quote) return true
    const token = xml.slice(cursor + 1, end).trim()
    if (!token || token.startsWith('!')) {
      cursor = end + 1
      continue
    }
    const closing = token.startsWith('/')
    const selfClosing = /\/\s*$/.test(token)
    const tagName = (closing ? token.slice(1) : token).match(/^[A-Za-z_][A-Za-z0-9_.:-]*/)?.[0]
    if (!tagName) return true
    if (closing) {
      if (depth === 0) return true
      depth -= 1
      if (depth === 0) rootSeen = true
    } else {
      if (depth === 0 && rootSeen) return true
      if (depth === 0) rootSeen = true
      if (!selfClosing) depth += 1
    }
    cursor = end + 1
  }
  return false
}

function inspectDocumentStructure(document: Document, issues: MsProjectXmlIssue[]): boolean {
  const roots = elementChildren(document)
  if (roots.length !== 1) {
    addIssue(issues, makeIssue('ROOT_ELEMENT_INVALID', 'document', 'The XML document must contain exactly one root element.'))
    return false
  }
  for (let index = 0; index < document.childNodes.length; index += 1) {
    const child = document.childNodes.item(index)
    if (child && (child.nodeType === 3 || child.nodeType === 4) && child.nodeValue?.trim()) {
      addIssue(issues, makeIssue('XML_PARSE_ERROR', 'document', 'Non-whitespace text is not allowed outside the Project root.'))
      return false
    }
  }
  if (document.doctype) {
    addIssue(issues, makeIssue('DTD_NOT_ALLOWED', 'document', 'DTD and entity declarations are not accepted.'))
    return false
  }
  return true
}

function buildTaskPath(tasks: RawTask[], index: number, generatedPaths: Map<number, string[]>, childCounts: Map<number, number>, issues: MsProjectXmlIssue[]): { parent: RawTask | null; path: string[] } {
  const task = tasks[index]
  if (!task) return { parent: null, path: [] }
  if (task.outlineLevel > 1 && index === 0) {
    addIssue(issues, makeIssue('OUTLINE_HIERARCHY_INVALID', `Tasks.Task[${task.index}]`, 'The first imported task must begin at outline level 1.'))
  }
  const previous = tasks[index - 1]
  if (previous && task.outlineLevel > previous.outlineLevel + 1) {
    addIssue(issues, makeIssue('OUTLINE_HIERARCHY_INVALID', `Tasks.Task[${task.index}]`, 'Outline levels may not skip an intermediate parent.'))
  }
  const parent = task.outlineLevel > 1 ? [...tasks.slice(0, index)].reverse().find((candidate) => candidate.outlineLevel === task.outlineLevel - 1) ?? null : null
  if (task.outlineLevel > 1 && !parent) addIssue(issues, makeIssue('OUTLINE_HIERARCHY_INVALID', `Tasks.Task[${task.index}]`, 'Every nested task must have a preceding parent at the prior outline level.'))

  const parentKey = parent?.sourceUid ?? 0
  const ordinal = (childCounts.get(parentKey) ?? 0) + 1
  childCounts.set(parentKey, ordinal)
  const generated = parent ? [...(generatedPaths.get(parent.sourceUid) ?? []), String(ordinal)] : [String(ordinal)]
  if (task.outlineNumber) {
    const explicit = task.outlineNumber.split('.')
    if (explicit.length !== generated.length || explicit.some((segment, position) => segment !== generated[position])) {
      addIssue(issues, makeIssue('OUTLINE_HIERARCHY_INVALID', `Tasks.Task[${task.index}].OutlineNumber`, 'OutlineNumber must follow the source sibling sequence and preceding parent path.'))
    }
  }
  const path = task.outlineNumber ? task.outlineNumber.split('.') : generated
  generatedPaths.set(task.sourceUid, path)
  return { parent, path }
}

function detectCycles(tasks: RawTask[], issues: MsProjectXmlIssue[]): void {
  const predecessorByUid = new Map<number, number>()
  for (const task of tasks) if (task.rawPredecessor) predecessorByUid.set(task.sourceUid, task.rawPredecessor.predecessorUid)
  const state = new Map<number, 0 | 1 | 2>()
  const reported = new Set<number>()
  const visit = (uid: number): void => {
    const currentState = state.get(uid) ?? 0
    if (currentState === 2) return
    if (currentState === 1) {
      if (!reported.has(uid)) {
        reported.add(uid)
        addIssue(issues, makeIssue('DEPENDENCY_CYCLE', `Tasks.Task[UID=${uid}]`, 'Predecessor links contain a cycle.'))
      }
      return
    }
    state.set(uid, 1)
    const predecessor = predecessorByUid.get(uid)
    if (predecessor !== undefined) visit(predecessor)
    state.set(uid, 2)
  }
  for (const task of tasks) visit(task.sourceUid)
}

function parseTasks(tasksElement: Element, namespace: string, issues: MsProjectXmlIssue[], notices: MsProjectXmlIssue[]): { tasks: MsProjectXmlPreviewTask[]; omittedSummaryTask: { sourceUid: 0; name: string } | null } {
  const taskElements = elementChildren(tasksElement)
  const omitted = { value: null as { sourceUid: 0; name: string } | null }
  const rawTasks: RawTask[] = []
  const seenUids = new Set<number>()
  for (let index = 0; index < taskElements.length; index += 1) {
    const element = taskElements[index]
    if (!element) continue
    const path = `Tasks.Task[${index + 1}]`
    if (localName(element) !== 'Task' || element.namespaceURI !== namespace) {
      addIssue(issues, makeIssue('UNSUPPORTED_TASK', path, 'Only Project-namespace Task elements are supported inside Tasks.'))
      continue
    }
    const uid = parseInteger(readOptionalText(element, 'UID', namespace, `${path}.UID`, issues), `${path}.UID`, issues, { required: true, min: 0, max: 2_147_483_647, missingCode: 'TASK_UID_MISSING', invalidCode: 'TASK_UID_INVALID' })
    if (uid === null) continue
    if (seenUids.has(uid)) {
      addIssue(issues, makeIssue('DUPLICATE_TASK_UID', `${path}.UID`, 'Task UID values must be unique within the source project.'))
      continue
    }
    seenUids.add(uid)
    const externalTaskProject = readOptionalText(element, 'ExternalTaskProject', namespace, `${path}.ExternalTaskProject`, issues)
    const subprojectName = readOptionalText(element, 'SubprojectName', namespace, `${path}.SubprojectName`, issues)
    if (externalTaskProject || subprojectName) addIssue(issues, makeIssue('UNSUPPORTED_TASK', path, 'External and subproject source fields are not supported by the local schedule register.'))
    const name = readOptionalText(element, 'Name', namespace, `${path}.Name`, issues) ?? ''
    const isSummary = parseBoolean(readOptionalText(element, 'Summary', namespace, `${path}.Summary`, issues), `${path}.Summary`, issues, false)
    if (uid === 0 && isSummary) {
      if (name) {
        if (name.length > 200) addIssue(issues, makeIssue('TASK_NAME_INVALID', `${path}.Name`, 'Imported task names may not exceed 200 characters.'))
        else if (omitted.value) addIssue(issues, makeIssue('DUPLICATE_TASK_UID', `${path}.UID`, 'Only one UID 0 project summary may be excluded.'))
        else {
          omitted.value = { sourceUid: 0, name }
          addIssue(notices, makeIssue('PROJECT_SUMMARY_EXCLUDED', path, 'The UID 0 project summary is excluded from import by design.', 'notice'))
        }
      } else addIssue(issues, makeIssue('TASK_NAME_INVALID', `${path}.Name`, 'The excluded project summary must still have a name.'))
      continue
    }
    if (uid === 0) {
      addIssue(issues, makeIssue('TASK_UID_INVALID', `${path}.UID`, 'UID 0 is reserved for the project summary and must be marked Summary.'))
      continue
    }
    if (!name || name.length > 200) addIssue(issues, makeIssue('TASK_NAME_INVALID', `${path}.Name`, 'Imported tasks require a non-empty name of 200 characters or fewer.'))
    const sourceIdText = readOptionalText(element, 'ID', namespace, `${path}.ID`, issues)
    const sourceId = parseInteger(sourceIdText, `${path}.ID`, issues, { required: false, min: 0, max: 2_147_483_647, invalidCode: 'TASK_ID_INVALID' })
    const outlineLevel = parseInteger(readOptionalText(element, 'OutlineLevel', namespace, `${path}.OutlineLevel`, issues), `${path}.OutlineLevel`, issues, { required: true, min: 1, max: MS_PROJECT_XML_MAX_XML_DEPTH, missingCode: 'OUTLINE_LEVEL_INVALID', invalidCode: 'OUTLINE_LEVEL_INVALID' })
    const outlineNumberValue = readOptionalText(element, 'OutlineNumber', namespace, `${path}.OutlineNumber`, issues)
    const outlineSegments = parseOutlineNumber(outlineNumberValue, `${path}.OutlineNumber`, issues)
    const outlineShapeValid = outlineNumberValue === null || (outlineSegments !== null && outlineLevel !== null && outlineSegments.length === outlineLevel)
    if (outlineSegments && outlineLevel !== null && outlineSegments.length !== outlineLevel) addIssue(issues, makeIssue('OUTLINE_HIERARCHY_INVALID', `${path}.OutlineNumber`, 'OutlineNumber segment count must match OutlineLevel.'))
    const sourceStart = parseDateEvidence(readOptionalText(element, 'Start', namespace, `${path}.Start`, issues), `${path}.Start`, issues)
    const sourceFinish = parseDateEvidence(readOptionalText(element, 'Finish', namespace, `${path}.Finish`, issues), `${path}.Finish`, issues)
    if (sourceStart && sourceFinish && compareLocalDateTime(sourceStart, sourceFinish) > 0) addIssue(issues, makeIssue('TASK_DATE_ORDER_INVALID', path, 'Finish must be on or after Start in the source calendar representation.'))
    const externalTask = parseBoolean(readOptionalText(element, 'ExternalTask', namespace, `${path}.ExternalTask`, issues), `${path}.ExternalTask`, issues, false)
    const subproject = parseBoolean(readOptionalText(element, 'IsSubproject', namespace, `${path}.IsSubproject`, issues), `${path}.IsSubproject`, issues, false)
    const nullTask = parseBoolean(readOptionalText(element, 'IsNull', namespace, `${path}.IsNull`, issues), `${path}.IsNull`, issues, false)
    if (externalTask || subproject || nullTask) addIssue(issues, makeIssue('UNSUPPORTED_TASK', path, 'External, subproject, and null tasks cannot be represented in the local schedule register.'))
    const predecessorLinks = directChildren(element, 'PredecessorLink', namespace)
    if (predecessorLinks.length > 1) addIssue(issues, makeIssue('DUPLICATE_PREDECESSOR', `${path}.PredecessorLink`, 'The current schedule register supports at most one predecessor.'))
    const rawPredecessor = predecessorLinks.length === 1 ? parseRawPredecessor(predecessorLinks[0]!, namespace, `${path}.PredecessorLink`, issues) : null
    if (outlineLevel !== null && sourceStart && sourceFinish && name.length > 0 && name.length <= 200 && outlineShapeValid && (sourceIdText === null || sourceId !== null) && !externalTask && !subproject && !nullTask) {
      rawTasks.push({ index: index + 1, sourceUid: uid, sourceId, outlineNumber: outlineSegments ? outlineNumberValue : null, outlineLevel, name, isSummary, sourceStart, sourceFinish, rawPredecessor, parentSourceUid: null, outlinePath: outlineSegments ?? [] })
    }
  }

  if (rawTasks.length > 0) {
    const generatedPaths = new Map<number, string[]>()
    const childCounts = new Map<number, number>()
    for (let index = 0; index < rawTasks.length; index += 1) {
      const task = rawTasks[index]
      if (!task) continue
      const hierarchy = buildTaskPath(rawTasks, index, generatedPaths, childCounts, issues)
      task.parentSourceUid = hierarchy.parent?.sourceUid ?? null
      task.outlinePath = hierarchy.path
      const duplicateSibling = task.outlineNumber
        ? rawTasks.slice(0, index).find((candidate) => candidate.parentSourceUid === task.parentSourceUid && candidate.outlineNumber === task.outlineNumber)
        : undefined
      if (duplicateSibling) addIssue(issues, makeIssue('OUTLINE_HIERARCHY_INVALID', `Tasks.Task[${task.index}].OutlineNumber`, 'Sibling OutlineNumber values must be unique.'))
      if (task.outlineNumber && hierarchy.parent) {
        const parentPath = generatedPaths.get(hierarchy.parent.sourceUid) ?? []
        if (!task.outlinePath.slice(0, parentPath.length).every((segment, position) => segment === parentPath[position])) addIssue(issues, makeIssue('OUTLINE_HIERARCHY_INVALID', `Tasks.Task[${task.index}].OutlineNumber`, 'OutlineNumber does not identify the preceding outline parent.'))
      }
    }
    for (const parent of rawTasks) {
      if (!parent.isSummary && rawTasks.some((candidate) => candidate.parentSourceUid === parent.sourceUid)) addIssue(issues, makeIssue('OUTLINE_HIERARCHY_INVALID', `Tasks.Task[${parent.index}].Summary`, 'A task with outline children must be marked Summary.'))
    }
    const byUid = new Map(rawTasks.map((task) => [task.sourceUid, task]))
    for (const task of rawTasks) {
      const predecessor = task.rawPredecessor
      if (!predecessor) continue
      const target = byUid.get(predecessor.predecessorUid)
      if (!target) addIssue(issues, makeIssue('PREDECESSOR_NOT_FOUND', `Tasks.Task[${task.index}].PredecessorLink.PredecessorUID`, 'Predecessor UID does not identify an imported task.'))
      else if (target.outlineLevel !== task.outlineLevel) addIssue(issues, makeIssue('PREDECESSOR_LEVEL_MISMATCH', `Tasks.Task[${task.index}].PredecessorLink`, 'Predecessor must be at the same source outline level for the current register.'))
    }
    detectCycles(rawTasks, issues)
  }

  const tasks = rawTasks.map((task) => ({
    sourceUid: task.sourceUid,
    sourceId: task.sourceId,
    outlineNumber: task.outlineNumber,
    outlineLevel: task.outlineLevel,
    outlinePath: task.outlinePath,
    name: task.name,
    isSummary: task.isSummary,
    sourceStart: task.sourceStart,
    sourceFinish: task.sourceFinish,
    parentSourceUid: task.parentSourceUid,
    predecessor: task.rawPredecessor && task.rawPredecessor.typeCode === 1 && !task.rawPredecessor.crossProject && !task.rawPredecessor.crossProjectName && task.rawPredecessor.linkLag === 0
      ? { predecessorUid: task.rawPredecessor.predecessorUid, typeCode: 1 as const, type: 'finish-to-start' as const, crossProject: false as const, crossProjectName: null, linkLag: 0 as const, lagFormat: task.rawPredecessor.lagFormat }
      : null,
  }))
  return { tasks, omittedSummaryTask: omitted.value }
}

export function parseMsProjectXmlSource(input: MsProjectXmlSource): MsProjectXmlPreview {
  const fileName = normalizeFileName(input.fileName)
  const sourceBase64 = typeof input.sourceBase64 === 'string' ? input.sourceBase64 : ''
  const decoded = decodeSource(sourceBase64)
  if ('issue' in decoded) return previewShell(fileName, null, 0, [decoded.issue], [])
  const sourceHash = createHash('sha256').update(decoded.bytes).digest('hex')
  const document = parseDocument(decoded.xml)
  if ('issue' in document) return previewShell(fileName, sourceHash, decoded.bytes.byteLength, [document.issue], [])
  const documentIssues: MsProjectXmlIssue[] = []
  if (!inspectDocumentStructure(document, documentIssues)) return previewShell(fileName, sourceHash, decoded.bytes.byteLength, documentIssues, [])
  const root = document.documentElement
  if (!root || localName(root) !== 'Project') return previewShell(fileName, sourceHash, decoded.bytes.byteLength, [makeIssue('ROOT_ELEMENT_INVALID', 'document', 'The XML document root must be Project.')], [])
  const namespace = root.namespaceURI
  if (namespace !== MS_PROJECT_XML_NAMESPACE && namespace !== MS_PROJECT_XML_2007_NAMESPACE) return previewShell(fileName, sourceHash, decoded.bytes.byteLength, [makeIssue('ROOT_NAMESPACE_INVALID', 'Project', 'The Project root must use a documented Microsoft Project namespace.')], [])
  const issues: MsProjectXmlIssue[] = []
  const notices: MsProjectXmlIssue[] = []
  inspectBounds(root, namespace, issues)
  if (issues.length > 0) return previewShell(fileName, sourceHash, decoded.bytes.byteLength, issues, notices)
  const rawProjectName = readOptionalText(root, 'Name', namespace, 'Project.Name', issues) ?? ''
  const projectName = rawProjectName.length <= 255 ? rawProjectName : ''
  if (rawProjectName.length > 255) addIssue(issues, makeIssue('XML_PARSE_ERROR', 'Project.Name', 'Project name may not exceed 255 characters.'))
  const tasksContainers = directChildren(root, 'Tasks', namespace)
  if (tasksContainers.length !== 1) {
    addIssue(issues, makeIssue('TASKS_MISSING', 'Project.Tasks', 'The Project document must contain exactly one Tasks collection.'))
    return previewShell(fileName, sourceHash, decoded.bytes.byteLength, issues, notices, { projectName })
  }
  const taskElements = elementChildren(tasksContainers[0]!)
  if (taskElements.filter((element) => localName(element) === 'Task').length > MS_PROJECT_XML_MAX_TASKS) {
    addIssue(issues, makeIssue('TASK_COUNT_EXCEEDED', 'Project.Tasks', `XML source may contain at most ${MS_PROJECT_XML_MAX_TASKS} tasks.`))
    return previewShell(fileName, sourceHash, decoded.bytes.byteLength, issues, notices, { projectName })
  }
  if (taskElements.length === 0) addIssue(issues, makeIssue('TASKS_MISSING', 'Project.Tasks', 'The Tasks collection must contain at least one Task.'))
  const parsedTasks = parseTasks(tasksContainers[0]!, namespace, issues, notices)
  if (parsedTasks.tasks.length === 0 && issues.length === 0) addIssue(issues, makeIssue('TASKS_MISSING', 'Project.Tasks', 'The source contains no importable tasks after the UID 0 summary exclusion.'))
  return previewShell(fileName, sourceHash, decoded.bytes.byteLength, issues, notices, { projectName, tasks: parsedTasks.tasks, omittedSummaryTask: parsedTasks.omittedSummaryTask })
}
