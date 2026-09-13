import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  parseMsProjectXmlSource,
} from './ms-project-xml-parser'
import {
  MS_PROJECT_XML_2007_NAMESPACE,
  MS_PROJECT_XML_MAX_TASKS,
  MS_PROJECT_XML_MAX_XML_DEPTH,
  MS_PROJECT_XML_MAX_XML_ELEMENTS,
  MS_PROJECT_XML_PARSER_VERSION,
} from '@third-code-erp/shared-types'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>12</SaveVersion>
  <Name>Reviewed Schedule</Name>
  <Tasks>
    <Task>
      <UID>0</UID>
      <ID>0</ID>
      <Name>Reviewed Schedule</Name>
      <OutlineNumber>0</OutlineNumber>
      <OutlineLevel>0</OutlineLevel>
      <Start>2026-09-01T08:00:00</Start>
      <Finish>2026-09-10T17:00:00</Finish>
      <Summary>1</Summary>
    </Task>
    <Task>
      <UID>1</UID>
      <ID>1</ID>
      <Name>Mobilization</Name>
      <OutlineNumber>1</OutlineNumber>
      <OutlineLevel>1</OutlineLevel>
      <Start>2026-09-01T08:00:00</Start>
      <Finish>2026-09-03T17:00:00</Finish>
      <Summary>1</Summary>
    </Task>
    <Task>
      <UID>2</UID>
      <ID>2</ID>
      <Name>Site setup</Name>
      <OutlineNumber>1.1</OutlineNumber>
      <OutlineLevel>2</OutlineLevel>
      <Start>2026-09-04T08:00:00+08:00</Start>
      <Finish>2026-09-05T17:00:00+08:00</Finish>
      <Summary>0</Summary>
    </Task>
    <Task>
      <UID>3</UID>
      <ID>3</ID>
      <Name>Complete setup</Name>
      <OutlineNumber>1.2</OutlineNumber>
      <OutlineLevel>2</OutlineLevel>
      <Start>2026-09-06T08:00:00+08:00</Start>
      <Finish>2026-09-07T17:00:00+08:00</Finish>
      <Summary>0</Summary>
      <PredecessorLink>
        <PredecessorUID>2</PredecessorUID>
        <Type>1</Type>
        <CrossProject>0</CrossProject>
        <LinkLag>0</LinkLag>
        <LagFormat>7</LagFormat>
      </PredecessorLink>
    </Task>
  </Tasks>
</Project>`

function encode(xml: string): string {
  return Buffer.from(xml, 'utf8').toString('base64')
}

function parse(xml: string): ReturnType<typeof parseMsProjectXmlSource> {
  return parseMsProjectXmlSource({ sourceBase64: encode(xml), fileName: 'fixture.xml' })
}

function replaceTaskField(xml: string, uid: number, field: string, value: string): string {
  const taskPattern = new RegExp(`(<Task>\\s*<UID>${uid}</UID>[\\s\\S]*?<\\/Task>)`)
  const taskMatch = taskPattern.exec(xml)
  if (!taskMatch) throw new Error(`Task UID ${uid} not found in fixture.`)
  const fieldPattern = new RegExp(`<${field}>[\\s\\S]*?<\\/${field}>`)
  const replacement = `<${field}>${value}</${field}>`
  if (!fieldPattern.test(taskMatch[1]!)) throw new Error(`Task field ${field} not found in fixture.`)
  const updatedTask = taskMatch[1]!.replace(fieldPattern, replacement)
  return xml.replace(taskMatch[1]!, updatedTask)
}

function addTaskChild(xml: string, uid: number, child: string): string {
  const taskPattern = new RegExp(`(<Task>\\s*<UID>${uid}</UID>[\\s\\S]*?)(</Task>)`)
  const taskMatch = taskPattern.exec(xml)
  if (!taskMatch) throw new Error(`Task UID ${uid} not found in fixture.`)
  return xml.replace(taskMatch[0]!, `${taskMatch[1]}${child}${taskMatch[2]}`)
}

const PREDECESSOR_UID_2 = '<PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><CrossProject>0</CrossProject><LinkLag>0</LinkLag></PredecessorLink>'

describe('MS Project XML parser', () => {
  it('returns a deterministic planning preview with unchanged source dates and hierarchy evidence', () => {
    const bytes = Buffer.from(XML, 'utf8')
    const preview = parseMsProjectXmlSource({
      sourceBase64: bytes.toString('base64'),
      fileName: '  reviewed.xml ',
    })
    expect(preview).toMatchObject({
      sourceHash: createHash('sha256').update(bytes).digest('hex'),
      sourceBytes: bytes.byteLength,
      parserVersion: MS_PROJECT_XML_PARSER_VERSION,
      fileName: 'reviewed.xml',
      projectName: 'Reviewed Schedule',
      canImport: true,
      omittedSummaryTask: { sourceUid: 0, name: 'Reviewed Schedule' },
      tasks: [
        {
          sourceUid: 1,
          sourceId: 1,
          outlineNumber: '1',
          outlineLevel: 1,
          outlinePath: ['1'],
          name: 'Mobilization',
          isSummary: true,
          sourceStart: { raw: '2026-09-01T08:00:00', calendarDate: '2026-09-01' },
          sourceFinish: { raw: '2026-09-03T17:00:00', calendarDate: '2026-09-03' },
          parentSourceUid: null,
          predecessor: null,
        },
        {
          sourceUid: 2,
          sourceId: 2,
          outlineNumber: '1.1',
          outlineLevel: 2,
          outlinePath: ['1', '1'],
          name: 'Site setup',
          isSummary: false,
          sourceStart: { raw: '2026-09-04T08:00:00+08:00', calendarDate: '2026-09-04' },
          sourceFinish: { raw: '2026-09-05T17:00:00+08:00', calendarDate: '2026-09-05' },
          parentSourceUid: 1,
          predecessor: null,
        },
        {
          sourceUid: 3,
          sourceId: 3,
          outlineNumber: '1.2',
          outlineLevel: 2,
          outlinePath: ['1', '2'],
          name: 'Complete setup',
          isSummary: false,
          sourceStart: { raw: '2026-09-06T08:00:00+08:00', calendarDate: '2026-09-06' },
          sourceFinish: { raw: '2026-09-07T17:00:00+08:00', calendarDate: '2026-09-07' },
          parentSourceUid: 1,
          predecessor: {
            predecessorUid: 2,
            typeCode: 1,
            type: 'finish-to-start',
            crossProject: false,
            crossProjectName: null,
            linkLag: 0,
            lagFormat: 7,
          },
        },
      ],
    })
    expect(preview.notices.some((notice) => notice.code === 'PROJECT_SUMMARY_EXCLUDED')).toBe(true)
    expect(preview.disclosures).toContain('Planning dates and hierarchy only; actuals, progress, resources, calendars, costs, and labour are not imported.')

    const project2007 = parse(XML.replaceAll('http://schemas.microsoft.com/project', MS_PROJECT_XML_2007_NAMESPACE))
    expect(project2007.canImport).toBe(true)
  })

  it('returns bounded actionable previews for invalid source bytes and declarations', () => {
    const invalidUtf8 = parseMsProjectXmlSource({ sourceBase64: Buffer.from([0x3c, 0x50, 0xff, 0x3e]).toString('base64') })
    expect(invalidUtf8.canImport).toBe(false)
    expect(invalidUtf8.sourceHash).toBeNull()
    expect(invalidUtf8.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'INVALID_UTF8' })]))

    const invalidBase64 = parseMsProjectXmlSource({ sourceBase64: 'YQ=' })
    expect(invalidBase64.canImport).toBe(false)
    expect(invalidBase64.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'INVALID_BASE64' })]))

    const badPadBits = parseMsProjectXmlSource({ sourceBase64: 'AB==' })
    expect(badPadBits.canImport).toBe(false)
    expect(badPadBits.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'INVALID_BASE64' })]))

    const emptySource = parseMsProjectXmlSource({ sourceBase64: '' })
    expect(emptySource.canImport).toBe(false)
    expect(emptySource.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'INVALID_BASE64' })]))

    const baselineBytes = Buffer.from(XML, 'utf8')
    const paddingLength = 1_048_576 - baselineBytes.byteLength - '<!--'.length - '-->'.length
    const exactMiB = XML.replace('</Project>', `<!--${'p'.repeat(paddingLength)}--></Project>`)
    expect(Buffer.byteLength(exactMiB, 'utf8')).toBe(1_048_576)
    const exactMiBPreview = parse(exactMiB)
    expect(exactMiBPreview.canImport).toBe(true)
    expect(exactMiBPreview.sourceBytes).toBe(1_048_576)

    const overMiB = parseMsProjectXmlSource({ sourceBase64: Buffer.concat([Buffer.from(exactMiB, 'utf8'), Buffer.from(' ') ]).toString('base64') })
    expect(overMiB.canImport).toBe(false)
    expect(overMiB.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SOURCE_TOO_LARGE' })]))

    const dtd = parse(`<?xml version="1.0"?><!DOCTYPE Project [<!ENTITY x "blocked">]><Project xmlns="http://schemas.microsoft.com/project"><Tasks/></Project>`)
    expect(dtd.canImport).toBe(false)
    expect(dtd.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DTD_NOT_ALLOWED' })]))
  })

  it('rejects non-canonical document structure, controls, and nested scalar fields without throwing', () => {
    const outsideText = parse(`text${XML}`)
    expect(outsideText.canImport).toBe(false)
    expect(outsideText.issues.some((issue) => issue.code === 'XML_PARSE_ERROR' || issue.code === 'ROOT_ELEMENT_INVALID')).toBe(true)

    const multipleRoots = parse(`${XML}<Project xmlns="http://schemas.microsoft.com/project"/>`)
    expect(multipleRoots.canImport).toBe(false)
    expect(multipleRoots.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'XML_PARSE_ERROR' })]))

    const wrongRoot = parse(XML.replace('<Project xmlns="http://schemas.microsoft.com/project">', '<Schedule xmlns="http://schemas.microsoft.com/project">').replace('</Project>', '</Schedule>'))
    expect(wrongRoot.canImport).toBe(false)
    expect(wrongRoot.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ROOT_ELEMENT_INVALID' })]))

    const wrongRootNamespace = parse(XML.replace('http://schemas.microsoft.com/project', 'urn:untrusted'))
    expect(wrongRootNamespace.canImport).toBe(false)
    expect(wrongRootNamespace.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ROOT_NAMESPACE_INVALID' })]))

    const malformedComment = parse(XML.replace('<SaveVersion>12</SaveVersion>', '<!-- malformed -- comment --><SaveVersion>12</SaveVersion>'))
    expect(malformedComment.canImport).toBe(false)
    expect(malformedComment.issues.some((issue) => issue.code === 'XML_PARSE_ERROR' || issue.code === 'XML_WARNING')).toBe(true)

    const controlCharacter = parse(XML.replace('<Name>Reviewed Schedule</Name>', `<Name>Bad\u0001Schedule</Name>`))
    expect(controlCharacter.canImport).toBe(false)
    expect(controlCharacter.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'XML_PARSE_ERROR' })]))

    for (const reference of ['&#0;', '&#1;', '&#xD800;', '&#xFFFE;']) {
      const invalidReference = parse(XML.replace('<Name>Reviewed Schedule</Name>', `<Name>Bad ${reference}</Name>`))
      expect(invalidReference.canImport).toBe(false)
      expect(invalidReference.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'XML_PARSE_ERROR' })]))
    }

    const validUnicode = parse(replaceTaskField(XML, 1, 'Name', 'Mobilization &#x1F600; &amp;'))
    expect(validUnicode.canImport).toBe(true)
    expect(validUnicode.tasks.find((task) => task.sourceUid === 1)?.name).toBe('Mobilization 😀 &')

    const cdataOutsideRoot = parse(`<![CDATA[   ]]>${XML}`)
    expect(cdataOutsideRoot.canImport).toBe(false)
    expect(cdataOutsideRoot.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'XML_PARSE_ERROR' })]))

    const nestedName = parse(replaceTaskField(XML, 1, 'Name', '<x>Mobilization</x>'))
    expect(nestedName.canImport).toBe(false)
    expect(nestedName.tasks.some((task) => task.sourceUid === 1)).toBe(false)
    expect(nestedName.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'XML_PARSE_ERROR' })]))

    const nestedProjectName = parse(XML.replace('<Name>Reviewed Schedule</Name>', '<Name><x>Reviewed Schedule</x></Name>'))
    expect(nestedProjectName.canImport).toBe(false)
    expect(nestedProjectName.projectName).toBe('')
    expect(nestedProjectName.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'XML_PARSE_ERROR' })]))

    const wrongChildNamespace = parse(XML.replace('<Tasks>', '<Tasks xmlns="">'))
    expect(wrongChildNamespace.canImport).toBe(false)
    expect(wrongChildNamespace.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ROOT_NAMESPACE_INVALID' })]))
  })

  it('rejects malformed task fields with a stable preview rather than schema-throwing', () => {
    const overlongName = parse(replaceTaskField(XML, 1, 'Name', 'x'.repeat(201)))
    expect(overlongName.canImport).toBe(false)
    expect(overlongName.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TASK_NAME_INVALID' })]))
    expect(overlongName.tasks.every((task) => task.name.length <= 200)).toBe(true)

    const overlongDate = parse(replaceTaskField(XML, 1, 'Start', `2026-09-01T08:00:00.${'1'.repeat(60)}`))
    expect(overlongDate.canImport).toBe(false)
    expect(overlongDate.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TASK_DATE_INVALID' })]))
    expect(overlongDate.tasks.every((task) => task.sourceStart.raw.length <= 64)).toBe(true)

    const overlongOutline = parse(replaceTaskField(XML, 3, 'OutlineNumber', '1'.repeat(256)))
    expect(overlongOutline.canImport).toBe(false)
    expect(overlongOutline.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'OUTLINE_NUMBER_INVALID' })]))
    expect(overlongOutline.tasks.every((task) => task.outlineNumber === null || task.outlineNumber.length <= 255)).toBe(true)

    const overlongProjectName = parse(XML.replace('<Name>Reviewed Schedule</Name>', `<Name>${'p'.repeat(256)}</Name>`))
    expect(overlongProjectName.canImport).toBe(false)
    expect(overlongProjectName.projectName).toBe('')
    expect(overlongProjectName.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'XML_PARSE_ERROR' })]))
  })

  it('validates real calendar dates, source-local ordering, and preserves timezone evidence', () => {
    const yearOne = parse(replaceTaskField(replaceTaskField(XML, 1, 'Start', '0001-02-28T08:00:00Z'), 1, 'Finish', '0001-03-01T17:00:00Z'))
    expect(yearOne.canImport).toBe(true)
    expect(yearOne.tasks.find((task) => task.sourceUid === 1)?.sourceStart).toEqual({ raw: '0001-02-28T08:00:00Z', calendarDate: '0001-02-28' })

    const impossibleDate = parse(replaceTaskField(XML, 1, 'Start', '2026-02-29T08:00:00'))
    expect(impossibleDate.canImport).toBe(false)
    expect(impossibleDate.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TASK_DATE_INVALID' })]))

    const impossibleTime = parse(replaceTaskField(XML, 1, 'Finish', '2026-09-03T24:00:00'))
    expect(impossibleTime.canImport).toBe(false)
    expect(impossibleTime.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TASK_DATE_INVALID' })]))

    const reversed = parse(replaceTaskField(XML, 1, 'Finish', '2026-08-31T17:00:00'))
    expect(reversed.canImport).toBe(false)
    expect(reversed.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TASK_DATE_ORDER_INVALID' })]))
  })

  it('rejects unsupported, external, duplicate, missing, and cyclic predecessor links', () => {
    const unsupportedType = parse(replaceTaskField(XML, 3, 'Type', '2'))
    expect(unsupportedType.canImport).toBe(false)
    expect(unsupportedType.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNSUPPORTED_DEPENDENCY_TYPE' })]))

    const lagged = parse(replaceTaskField(XML, 3, 'LinkLag', '60'))
    expect(lagged.canImport).toBe(false)
    expect(lagged.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DEPENDENCY_LAG_NOT_SUPPORTED' })]))

    const external = parse(replaceTaskField(XML, 3, 'CrossProject', '1'))
    expect(external.canImport).toBe(false)
    expect(external.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'EXTERNAL_DEPENDENCY' })]))

    const duplicate = parse(addTaskChild(XML, 3, PREDECESSOR_UID_2))
    expect(duplicate.canImport).toBe(false)
    expect(duplicate.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DUPLICATE_PREDECESSOR' })]))

    const missing = parse(replaceTaskField(XML, 3, 'PredecessorUID', '99'))
    expect(missing.canImport).toBe(false)
    expect(missing.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PREDECESSOR_NOT_FOUND' })]))

    const missingPredecessorUid = parse(replaceTaskField(XML, 3, 'PredecessorUID', ''))
    expect(missingPredecessorUid.canImport).toBe(false)
    expect(missingPredecessorUid.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PREDECESSOR_UID_MISSING' })]))

    const levelMismatch = parse(addTaskChild(XML, 1, PREDECESSOR_UID_2))
    expect(levelMismatch.canImport).toBe(false)
    expect(levelMismatch.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PREDECESSOR_LEVEL_MISMATCH' })]))

    const cyclic = addTaskChild(replaceTaskField(XML, 3, 'PredecessorUID', '2'), 2, '<PredecessorLink><PredecessorUID>3</PredecessorUID><Type>1</Type><CrossProject>0</CrossProject><LinkLag>0</LinkLag></PredecessorLink>')
    const cyclicPreview = parse(cyclic)
    expect(cyclicPreview.canImport).toBe(false)
    expect(cyclicPreview.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DEPENDENCY_CYCLE' })]))
  })

  it('rejects identity and hierarchy ambiguity instead of inventing paths', () => {
    const duplicateUid = parse(replaceTaskField(XML, 3, 'UID', '2'))
    expect(duplicateUid.canImport).toBe(false)
    expect(duplicateUid.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DUPLICATE_TASK_UID' })]))

    const missingUid = parse(replaceTaskField(XML, 3, 'UID', ''))
    expect(missingUid.canImport).toBe(false)
    expect(missingUid.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TASK_UID_MISSING' })]))

    const reservedUid = parse(replaceTaskField(XML, 0, 'Summary', '0'))
    expect(reservedUid.canImport).toBe(false)
    expect(reservedUid.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TASK_UID_INVALID' })]))

    const duplicateOutline = parse(replaceTaskField(XML, 3, 'OutlineNumber', '1.1'))
    expect(duplicateOutline.canImport).toBe(false)
    expect(duplicateOutline.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'OUTLINE_HIERARCHY_INVALID' })]))

    const wrongPrefix = parse(replaceTaskField(XML, 3, 'OutlineNumber', '2.1'))
    expect(wrongPrefix.canImport).toBe(false)
    expect(wrongPrefix.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'OUTLINE_HIERARCHY_INVALID' })]))

    const sequenceGap = parse(replaceTaskField(XML, 3, 'OutlineNumber', '1.3'))
    expect(sequenceGap.canImport).toBe(false)
    expect(sequenceGap.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'OUTLINE_HIERARCHY_INVALID' })]))

    const zeroOutline = parse(replaceTaskField(XML, 3, 'OutlineNumber', '0'))
    expect(zeroOutline.canImport).toBe(false)
    expect(zeroOutline.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'OUTLINE_NUMBER_INVALID' })]))

    const skippedLevel = parse(replaceTaskField(replaceTaskField(XML, 2, 'OutlineLevel', '3'), 2, 'OutlineNumber', '1.1.1'))
    expect(skippedLevel.canImport).toBe(false)
    expect(skippedLevel.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'OUTLINE_HIERARCHY_INVALID' })]))

    const nonSummaryParent = parse(replaceTaskField(XML, 1, 'Summary', '0'))
    expect(nonSummaryParent.canImport).toBe(false)
    expect(nonSummaryParent.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'OUTLINE_HIERARCHY_INVALID' })]))
  })

  it('enforces task, element, nesting, and unsupported-task bounds', () => {
    const tasks = Array.from({ length: MS_PROJECT_XML_MAX_TASKS + 1 }, (_, index) => `<Task><UID>${index + 1}</UID><ID>${index + 1}</ID><Name>Task ${index + 1}</Name><OutlineNumber>${index + 1}</OutlineNumber><OutlineLevel>1</OutlineLevel><Start>2026-09-01T08:00:00</Start><Finish>2026-09-01T17:00:00</Finish><Summary>0</Summary></Task>`).join('')
    const tooManyTasks = parse(`<Project xmlns="http://schemas.microsoft.com/project"><Tasks>${tasks}</Tasks></Project>`)
    expect(tooManyTasks.canImport).toBe(false)
    expect(tooManyTasks.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TASK_COUNT_EXCEEDED' })]))

    const extraElements = '<X/>'.repeat(MS_PROJECT_XML_MAX_XML_ELEMENTS + 1)
    const tooManyElements = parse(`<Project xmlns="http://schemas.microsoft.com/project"><Tasks><Task><UID>1</UID><Name>Task</Name><OutlineNumber>1</OutlineNumber><OutlineLevel>1</OutlineLevel><Start>2026-09-01T08:00:00</Start><Finish>2026-09-01T17:00:00</Finish></Task></Tasks>${extraElements}</Project>`)
    expect(tooManyElements.canImport).toBe(false)
    expect(tooManyElements.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'XML_ELEMENT_COUNT_EXCEEDED' })]))

    const nested = '<X>'.repeat(MS_PROJECT_XML_MAX_XML_DEPTH + 1) + '</X>'.repeat(MS_PROJECT_XML_MAX_XML_DEPTH + 1)
    const tooDeep = parse(`<Project xmlns="http://schemas.microsoft.com/project">${nested}</Project>`)
    expect(tooDeep.canImport).toBe(false)
    expect(tooDeep.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'XML_DEPTH_EXCEEDED' })]))

    const unsupported = parse(addTaskChild(XML, 2, '<ExternalTask>1</ExternalTask>'))
    expect(unsupported.canImport).toBe(false)
    expect(unsupported.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNSUPPORTED_TASK' })]))
  })

  it('fails closed on structural external-project evidence and nested task collections', () => {
    const externalProject = parse(addTaskChild(XML, 2, '<ExternalTaskProject>supplier.mpp</ExternalTaskProject>'))
    expect(externalProject.canImport).toBe(false)
    expect(externalProject.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNSUPPORTED_TASK' })]))

    const subproject = parse(addTaskChild(XML, 3, '<SubprojectName>supplier.mpp</SubprojectName>'))
    expect(subproject.canImport).toBe(false)
    expect(subproject.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNSUPPORTED_TASK' })]))

    const summaryExternalEvidence = parse(addTaskChild(XML, 0, '<ExternalTaskProject>supplier.mpp</ExternalTaskProject>'))
    expect(summaryExternalEvidence.canImport).toBe(false)
    expect(summaryExternalEvidence.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNSUPPORTED_TASK' })]))

    const nestedProject = parse(addTaskChild(XML, 2, '<Project><Tasks><Task><UID>99</UID></Task></Tasks></Project>'))
    expect(nestedProject.canImport).toBe(false)
    expect(nestedProject.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNSUPPORTED_TASK' })]))
  })
})
