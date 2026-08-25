import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES } from '@third-code-erp/shared-types'

import {
  documents,
  documentUploadReservations,
  lockProjectDocumentStorageUsage,
  projects,
  tenants,
  users,
  type Database,
} from '..'
import * as databaseSchema from '../schema'

const POSTGRES_IMAGE =
  'postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
const containerName = `erp-document-contention-${process.pid}-${randomUUID().replaceAll('-', '').slice(0, 12)}`
const testDirectory = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(
  testDirectory,
  'document-storage-contention.fixture.sql',
)
const migrationPath = resolve(
  testDirectory,
  '../../../../supabase/migrations/20260824110438_document_upload_reservations.sql',
)

const MEBIBYTE = 1024 * 1024
const PROJECT_QUOTA_BYTES = PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES
const WRITER_BYTES = 50 * MEBIBYTE
const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '77777777-7777-4777-8777-777777777777'
const PROJECT_A = '22222222-2222-4222-8222-222222222222'
const PROJECT_B = '99999999-9999-4999-8999-999999999999'
const ACTOR_A = '33333333-3333-4333-8333-333333333331'
const ACTOR_B = '33333333-3333-4333-8333-333333333332'
const FOREIGN_ACTOR = '88888888-8888-4888-8888-888888888888'

type RunResult = Readonly<{
  code: number
  stdout: string
  stderr: string
}>

type RunOptions = Readonly<{
  input?: string
  allowFailure?: boolean
  timeoutMs?: number
}>

type ClientHandle = ReturnType<typeof createDatabaseClient>
type PauseAfterUsage = () => Promise<void>

type ReservationInput = Readonly<{
  id: string
  tenantId: string
  projectId: string
  actorId: string
  idempotencyKey: string
  requestHash: string
  fileName: string
  sizeBytes: number
}>

type IntakeInput = Readonly<{
  id: string
  tenantId: string
  projectId: string
  actorId: string
  fileName: string
  sizeBytes: number
}>

type ReservationOutcome =
  | Readonly<{ kind: 'accepted'; id: string; replayed: boolean }>
  | Readonly<{ kind: 'quota_exceeded' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{
      kind: 'terminal'
      id: string
      state: 'completed' | 'released' | 'expired'
    }>

type IntakeOutcome =
  | Readonly<{ kind: 'accepted'; id: string }>
  | Readonly<{ kind: 'quota_exceeded' }>
  | Readonly<{ kind: 'not_found' }>

type PidRow = Readonly<{ pid: number }>
type WaitRow = Readonly<{
  pid: number
  wait_event_type: string | null
  wait_event: string | null
  blocking_pids: string
}>

const activeChildren = new Set<ReturnType<typeof spawn>>()
let admin: ClientHandle
let observer: ClientHandle
let postgresPort = 0

function run(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const {
    input,
    allowFailure = false,
    timeoutMs = 30_000,
  } = options

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    activeChildren.add(child)
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    function finish(callback: () => void): void {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      activeChildren.delete(child)
      callback()
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.stdin.on('error', () => undefined)
    child.on('error', (error) => finish(() => rejectPromise(error)))
    child.on('close', (code) => {
      finish(() => {
        if (timedOut) {
          rejectPromise(new Error(`${command} timed out after ${timeoutMs}ms`))
          return
        }

        const result = { code: code ?? 1, stdout, stderr }
        if (!allowFailure && result.code !== 0) {
          rejectPromise(
            new Error(
              `${command} exited ${result.code}: ${stderr.trim().slice(0, 2_000)}`,
            ),
          )
          return
        }
        resolvePromise(result)
      })
    })

    child.stdin.end(input)
  })
}

function runDocker(
  args: readonly string[],
  options?: RunOptions,
): Promise<RunResult> {
  return run('docker', args, options)
}

function runPsql(sqlText: string): Promise<RunResult> {
  return runDocker(
    [
      'exec',
      '-i',
      containerName,
      'psql',
      '-X',
      '--username=postgres',
      '--dbname=postgres',
      '--set=ON_ERROR_STOP=1',
      '--quiet',
    ],
    { input: sqlText, timeoutMs: 30_000 },
  )
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const readiness = await runDocker(
      [
        'exec',
        containerName,
        'pg_isready',
        '--username=postgres',
        '--dbname=postgres',
      ],
      { allowFailure: true, timeoutMs: 5_000 },
    )
    if (readiness.code === 0) return
    await delay(250)
  }
  throw new Error('Disposable PostgreSQL did not become ready')
}

function parsePublishedPort(output: string): number {
  const match = output.trim().match(/127\.0\.0\.1:(\d+)$/)
  if (!match) throw new Error('Disposable PostgreSQL port was not published')
  const port = Number(match[1])
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('Disposable PostgreSQL published an invalid port')
  }
  return port
}

function createDatabaseClient(port: number, applicationName: string) {
  const connection = postgres({
    host: '127.0.0.1',
    port,
    database: 'postgres',
    username: 'postgres',
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 60,
    connection: { application_name: applicationName },
    onnotice: () => undefined,
  })
  const database: Database = drizzle(connection, { schema: databaseSchema })
  return { connection, database }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

function deferred<T>() {
  let resolveDeferred: (value: T | PromiseLike<T>) => void = () => undefined
  let rejectDeferred: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveDeferred = resolvePromise
    rejectDeferred = rejectPromise
  })
  return { promise, reject: rejectDeferred, resolve: resolveDeferred }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolvePromise, rejectPromise) => {
        timeout = setTimeout(() => rejectPromise(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

async function backendPid(database: Database): Promise<number> {
  const rows = await database.execute(
    sql<PidRow>`select pg_backend_pid()::integer as pid`,
  )
  const row = rows[0]
  if (!isPidRow(row)) {
    throw new TypeError('Database returned an invalid backend PID')
  }
  return row.pid
}

function isPidRow(value: unknown): value is PidRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pid' in value &&
    typeof value.pid === 'number' &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0
  )
}

function isWaitRow(value: unknown): value is WaitRow {
  return (
    isPidRow(value) &&
    'wait_event_type' in value &&
    (typeof value.wait_event_type === 'string' ||
      value.wait_event_type === null) &&
    'wait_event' in value &&
    (typeof value.wait_event === 'string' || value.wait_event === null) &&
    'blocking_pids' in value &&
    typeof value.blocking_pids === 'string'
  )
}

function parsePidArray(value: string): readonly number[] {
  const parsed: unknown = JSON.parse(value)
  if (
    !Array.isArray(parsed) ||
    !parsed.every((entry) => Number.isSafeInteger(entry) && entry > 0)
  ) {
    throw new TypeError('Database returned invalid blocking PIDs')
  }
  return parsed
}

async function waitForBackendLock(
  waitingPid: number,
  blockingPid: number,
): Promise<WaitRow> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await observer.database.execute(sql<WaitRow>`
      select
        pid::integer as pid,
        wait_event_type::text as wait_event_type,
        wait_event::text as wait_event,
        to_json(pg_blocking_pids(pid))::text as blocking_pids
      from pg_stat_activity
      where pid = ${waitingPid}
    `)
    const row = rows[0]
    if (
      isWaitRow(row) &&
      row.wait_event_type === 'Lock' &&
      parsePidArray(row.blocking_pids).includes(blockingPid)
    ) {
      return row
    }
    await delay(25)
  }
  throw new Error('Contending backend did not wait on the project lock')
}

function exactByteTotal(value: number): bigint {
  assert(Number.isSafeInteger(value) && value >= 0)
  return BigInt(value)
}

async function reserve(
  database: Database,
  input: ReservationInput,
  pauseAfterUsage?: PauseAfterUsage,
): Promise<ReservationOutcome> {
  return database.transaction(async (transaction) => {
    const usage = await lockProjectDocumentStorageUsage(transaction, {
      tenantId: input.tenantId,
      projectId: input.projectId,
    })
    if (!usage) return { kind: 'not_found' }
    await pauseAfterUsage?.()

    const [existing] = await transaction
      .select({
        id: documentUploadReservations.id,
        state: documentUploadReservations.state,
      })
      .from(documentUploadReservations)
      .where(
        and(
          eq(documentUploadReservations.tenant_id, input.tenantId),
          eq(documentUploadReservations.actor_id, input.actorId),
          eq(
            documentUploadReservations.idempotency_key,
            input.idempotencyKey,
          ),
        ),
      )
      .limit(1)
      .for('update')

    if (existing?.state === 'active') {
      return { kind: 'accepted', id: existing.id, replayed: true }
    }
    if (existing) {
      return { kind: 'terminal', id: existing.id, state: existing.state }
    }
    if (
      usage.totalBytes + exactByteTotal(input.sizeBytes) >
      exactByteTotal(PROJECT_QUOTA_BYTES)
    ) {
      return { kind: 'quota_exceeded' }
    }

    await transaction.insert(documentUploadReservations).values({
      id: input.id,
      tenant_id: input.tenantId,
      project_id: input.projectId,
      actor_id: input.actorId,
      storage_path: `${input.tenantId}/${input.projectId}/${input.id}-${input.fileName}`,
      original_file_name: input.fileName,
      description: null,
      declared_size_bytes: input.sizeBytes,
      declared_content_type: 'application/pdf',
      idempotency_key: input.idempotencyKey,
      request_hash: input.requestHash,
    })
    return { kind: 'accepted', id: input.id, replayed: false }
  })
}

async function intake(
  database: Database,
  input: IntakeInput,
  pauseAfterUsage?: PauseAfterUsage,
): Promise<IntakeOutcome> {
  return database.transaction(async (transaction) => {
    const usage = await lockProjectDocumentStorageUsage(transaction, {
      tenantId: input.tenantId,
      projectId: input.projectId,
    })
    if (!usage) return { kind: 'not_found' }
    await pauseAfterUsage?.()

    if (
      usage.totalBytes + exactByteTotal(input.sizeBytes) >
      exactByteTotal(PROJECT_QUOTA_BYTES)
    ) {
      return { kind: 'quota_exceeded' }
    }

    await transaction.insert(documents).values({
      id: input.id,
      tenant_id: input.tenantId,
      project_id: input.projectId,
      opportunity_id: null,
      uploaded_by: input.actorId,
      document_type: 'pdf',
      file_name: input.fileName,
      storage_path: `${input.tenantId}/${input.projectId}/${input.fileName}`,
      mime_type: 'application/pdf',
      size_bytes: input.sizeBytes,
      description: null,
    })
    return { kind: 'accepted', id: input.id }
  })
}

async function releaseReservation(
  database: Database,
  input: ReservationInput,
): Promise<Readonly<{ state: 'released'; replayed: boolean }>> {
  return database.transaction(async (transaction) => {
    const usage = await lockProjectDocumentStorageUsage(transaction, {
      tenantId: input.tenantId,
      projectId: input.projectId,
    })
    if (!usage) throw new Error('Project disappeared during release')

    const [reservation] = await transaction
      .select({ state: documentUploadReservations.state })
      .from(documentUploadReservations)
      .where(
        and(
          eq(documentUploadReservations.id, input.id),
          eq(documentUploadReservations.tenant_id, input.tenantId),
          eq(documentUploadReservations.project_id, input.projectId),
          eq(documentUploadReservations.actor_id, input.actorId),
        ),
      )
      .limit(1)
      .for('update')
    if (!reservation) throw new Error('Reservation disappeared during release')
    if (reservation.state === 'released') {
      return { state: 'released', replayed: true }
    }
    if (reservation.state !== 'active') {
      throw new Error('Reservation is not releasable')
    }

    await transaction
      .update(documentUploadReservations)
      .set({ state: 'released', terminal_at: new Date(), updated_at: new Date() })
      .where(eq(documentUploadReservations.id, input.id))
    return { state: 'released', replayed: false }
  })
}

async function runSerializedPair<Winner, Contender>(
  name: string,
  winnerOperation: (
    database: Database,
    pauseAfterUsage: PauseAfterUsage,
  ) => Promise<Winner>,
  contenderOperation: (database: Database) => Promise<Contender>,
): Promise<Readonly<{
  winner: Winner
  contender: Contender
  wait: WaitRow
  winnerPid: number
  contenderPid: number
}>> {
  const winnerClient = createDatabaseClient(postgresPort, `${name}-winner`)
  const contenderClient = createDatabaseClient(
    postgresPort,
    `${name}-contender`,
  )
  const reachedPause = deferred<void>()
  const releasePause = deferred<void>()

  try {
    const winnerPid = await backendPid(winnerClient.database)
    const contenderPid = await backendPid(contenderClient.database)
    expect(contenderPid).not.toBe(winnerPid)

    const winnerPromise = winnerOperation(winnerClient.database, async () => {
      reachedPause.resolve()
      await releasePause.promise
    })
    void winnerPromise.catch(() => undefined)
    await withTimeout(
      Promise.race([
        reachedPause.promise,
        winnerPromise.then(() => {
          throw new Error('Winning writer committed before the test pause')
        }),
      ]),
      5_000,
      'Winning writer did not acquire the project lock',
    )

    const contenderPromise = contenderOperation(contenderClient.database)
    void contenderPromise.catch(() => undefined)
    let wait: WaitRow | undefined
    let observationFailure: unknown
    try {
      wait = await waitForBackendLock(contenderPid, winnerPid)
    } catch (error) {
      observationFailure = error
    } finally {
      releasePause.resolve()
    }

    const outcomes = await withTimeout(
      Promise.allSettled([winnerPromise, contenderPromise]),
      15_000,
      'Contending writers did not settle',
    )
    if (observationFailure) throw observationFailure
    if (!wait) throw new Error('Project-lock wait evidence is missing')

    const winnerOutcome = outcomes[0]
    const contenderOutcome = outcomes[1]
    if (winnerOutcome.status === 'rejected') throw winnerOutcome.reason
    if (contenderOutcome.status === 'rejected') throw contenderOutcome.reason

    return {
      winner: winnerOutcome.value,
      contender: contenderOutcome.value,
      wait,
      winnerPid,
      contenderPid,
    }
  } finally {
    releasePause.resolve()
    await Promise.all([
      winnerClient.connection.end({ timeout: 2 }),
      contenderClient.connection.end({ timeout: 2 }),
    ])
  }
}

function baseDocuments(
  tenantId: string,
  projectId: string,
  actorId: string,
  sizesInMebibytes: readonly number[],
) {
  return sizesInMebibytes.map((size, index) => ({
    id: randomUUID(),
    tenant_id: tenantId,
    project_id: projectId,
    opportunity_id: null,
    uploaded_by: actorId,
    document_type: 'pdf' as const,
    file_name: `base-${index}.pdf`,
    storage_path: `${tenantId}/${projectId}/base-${index}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: size * MEBIBYTE,
    description: null,
  }))
}

async function resetCommittedFixture(): Promise<void> {
  await admin.database.transaction(async (transaction) => {
    await transaction.delete(documentUploadReservations)
    await transaction.delete(documents)
    await transaction.insert(documents).values([
      ...baseDocuments(TENANT_A, PROJECT_A, ACTOR_A, [100, 100, 100, 100, 50]),
      ...baseDocuments(TENANT_B, PROJECT_B, FOREIGN_ACTOR, [100, 100, 100, 100, 100]),
    ])
  })
}

async function readUsage(tenantId: string, projectId: string) {
  return admin.database.transaction((transaction) =>
    lockProjectDocumentStorageUsage(transaction, { tenantId, projectId }),
  )
}

function reservationInput(
  actorId: string,
  suffix: string,
): ReservationInput {
  return {
    id: randomUUID(),
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    actorId,
    idempotencyKey: `reservation-${suffix}`,
    requestHash: randomUUID().replaceAll('-', '').padEnd(64, 'a'),
    fileName: `${suffix}.pdf`,
    sizeBytes: WRITER_BYTES,
  }
}

function intakeInput(actorId: string, suffix: string): IntakeInput {
  return {
    id: randomUUID(),
    tenantId: TENANT_A,
    projectId: PROJECT_A,
    actorId,
    fileName: `${suffix}.pdf`,
    sizeBytes: WRITER_BYTES,
  }
}

beforeAll(async () => {
  const fixtureSql = await readFile(fixturePath, 'utf8')
  const migrationSql = await readFile(migrationPath, 'utf8')

  try {
    await runDocker(
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_HOST_AUTH_METHOD=trust',
        '--publish',
        '127.0.0.1::5432',
        POSTGRES_IMAGE,
      ],
      { timeoutMs: 120_000 },
    )
    await waitForPostgres()
    await runPsql(fixtureSql)
    await runPsql(migrationSql)
    const publishedPort = await runDocker(['port', containerName, '5432/tcp'])
    postgresPort = parsePublishedPort(publishedPort.stdout)
    admin = createDatabaseClient(postgresPort, 'document-contention-admin')
    observer = createDatabaseClient(postgresPort, 'document-contention-observer')

    await admin.database.insert(tenants).values([
      { id: TENANT_A, name: 'Contention Tenant A', slug: 'contention-a' },
      { id: TENANT_B, name: 'Contention Tenant B', slug: 'contention-b' },
    ])
    await admin.database.insert(users).values([
      {
        id: ACTOR_A,
        tenant_id: TENANT_A,
        email: 'contention-a1@example.test',
        full_name: 'Contention Actor A',
        role: 'pm',
      },
      {
        id: ACTOR_B,
        tenant_id: TENANT_A,
        email: 'contention-a2@example.test',
        full_name: 'Contention Actor B',
        role: 'pm',
      },
      {
        id: FOREIGN_ACTOR,
        tenant_id: TENANT_B,
        email: 'contention-b@example.test',
        full_name: 'Contention Actor B',
        role: 'pm',
      },
    ])
    await admin.database.insert(projects).values([
      {
        id: PROJECT_A,
        tenant_id: TENANT_A,
        name: 'Contention Project A',
        client: 'Client A',
        status: 'active',
        project_type: 'mep',
        created_by: ACTOR_A,
      },
      {
        id: PROJECT_B,
        tenant_id: TENANT_B,
        name: 'Contention Project B',
        client: 'Client B',
        status: 'active',
        project_type: 'mep',
        created_by: FOREIGN_ACTOR,
      },
    ])
  } catch (error) {
    await runDocker(['rm', '--force', containerName], {
      allowFailure: true,
      timeoutMs: 15_000,
    })
    throw error
  }
}, 150_000)

beforeEach(async () => {
  await resetCommittedFixture()
})

afterAll(async () => {
  for (const child of activeChildren) child.kill('SIGKILL')
  if (admin) await admin.connection.end({ timeout: 2 })
  if (observer) await observer.connection.end({ timeout: 2 })
  const cleanup = await runDocker(['rm', '--force', containerName], {
    allowFailure: true,
    timeoutMs: 15_000,
  })
  if (cleanup.code !== 0 && !/no such container/i.test(cleanup.stderr)) {
    throw new Error('Failed to remove the owned disposable container')
  }
}, 30_000)

describe('project document-storage cross-session serialization', () => {
  it('serializes reservation versus reservation and preserves terminal replay', async () => {
    expect(PROJECT_QUOTA_BYTES).toBe(500 * MEBIBYTE)
    const initialUsage = await readUsage(TENANT_A, PROJECT_A)
    const foreignUsage = await readUsage(TENANT_B, PROJECT_B)
    const crossTenantScope = await readUsage(TENANT_B, PROJECT_A)
    expect(initialUsage).toMatchObject({
      committedBytes: 450n * BigInt(MEBIBYTE),
      activeReservationBytes: 0n,
      totalBytes: 450n * BigInt(MEBIBYTE),
    })
    expect(foreignUsage?.totalBytes).toBe(BigInt(PROJECT_QUOTA_BYTES))
    expect(crossTenantScope).toBeNull()

    const winnerInput = reservationInput(ACTOR_A, 'reservation-winner')
    const contenderInput = reservationInput(ACTOR_B, 'reservation-contender')
    const result = await runSerializedPair(
      'reservation-reservation',
      (database, pause) => reserve(database, winnerInput, pause),
      (database) => reserve(database, contenderInput),
    )

    expect(result.wait).toMatchObject({
      pid: result.contenderPid,
      wait_event_type: 'Lock',
    })
    expect(parsePidArray(result.wait.blocking_pids)).toContain(result.winnerPid)
    expect(result.winner).toEqual({
      kind: 'accepted',
      id: winnerInput.id,
      replayed: false,
    })
    expect(result.contender).toEqual({ kind: 'quota_exceeded' })

    const replay = await reserve(admin.database, winnerInput)
    expect(replay).toEqual({
      kind: 'accepted',
      id: winnerInput.id,
      replayed: true,
    })
    const reservationsBeforeRelease = await admin.database
      .select({ id: documentUploadReservations.id })
      .from(documentUploadReservations)
      .where(eq(documentUploadReservations.tenant_id, TENANT_A))
    expect(reservationsBeforeRelease).toEqual([{ id: winnerInput.id }])

    await expect(
      releaseReservation(admin.database, winnerInput),
    ).resolves.toEqual({ state: 'released', replayed: false })
    const terminalBeforeReplay = await admin.database
      .select({
        state: documentUploadReservations.state,
        terminalAt: documentUploadReservations.terminal_at,
        updatedAt: documentUploadReservations.updated_at,
      })
      .from(documentUploadReservations)
      .where(eq(documentUploadReservations.id, winnerInput.id))
    await expect(
      releaseReservation(admin.database, winnerInput),
    ).resolves.toEqual({ state: 'released', replayed: true })
    expect(await reserve(admin.database, winnerInput)).toEqual({
      kind: 'terminal',
      id: winnerInput.id,
      state: 'released',
    })
    const terminalAfterReplay = await admin.database
      .select({
        state: documentUploadReservations.state,
        terminalAt: documentUploadReservations.terminal_at,
        updatedAt: documentUploadReservations.updated_at,
      })
      .from(documentUploadReservations)
      .where(eq(documentUploadReservations.id, winnerInput.id))
    expect(terminalAfterReplay).toEqual(terminalBeforeReplay)

    const postReleaseIntake = intakeInput(ACTOR_B, 'post-release-intake')
    await expect(intake(admin.database, postReleaseIntake)).resolves.toEqual({
      kind: 'accepted',
      id: postReleaseIntake.id,
    })
    expect(await readUsage(TENANT_A, PROJECT_A)).toMatchObject({
      committedBytes: BigInt(PROJECT_QUOTA_BYTES),
      activeReservationBytes: 0n,
      totalBytes: BigInt(PROJECT_QUOTA_BYTES),
    })
  }, 30_000)

  it('serializes a reservation winner before a concurrent intake', async () => {
    const winnerInput = reservationInput(ACTOR_A, 'reserve-before-intake')
    const contenderInput = intakeInput(ACTOR_B, 'intake-after-reserve')
    const result = await runSerializedPair(
      'reservation-intake',
      (database, pause) => reserve(database, winnerInput, pause),
      (database) => intake(database, contenderInput),
    )

    expect(result.wait.wait_event_type).toBe('Lock')
    expect(result.winner).toEqual({
      kind: 'accepted',
      id: winnerInput.id,
      replayed: false,
    })
    expect(result.contender).toEqual({ kind: 'quota_exceeded' })
    expect(await readUsage(TENANT_A, PROJECT_A)).toMatchObject({
      committedBytes: 450n * BigInt(MEBIBYTE),
      activeReservationBytes: BigInt(WRITER_BYTES),
      totalBytes: BigInt(PROJECT_QUOTA_BYTES),
    })
  }, 30_000)

  it('serializes an intake winner before a concurrent reservation', async () => {
    const winnerInput = intakeInput(ACTOR_A, 'intake-before-reserve')
    const contenderInput = reservationInput(ACTOR_B, 'reserve-after-intake')
    const result = await runSerializedPair(
      'intake-reservation',
      (database, pause) => intake(database, winnerInput, pause),
      (database) => reserve(database, contenderInput),
    )

    expect(result.wait.wait_event_type).toBe('Lock')
    expect(result.winner).toEqual({ kind: 'accepted', id: winnerInput.id })
    expect(result.contender).toEqual({ kind: 'quota_exceeded' })
    expect(await readUsage(TENANT_A, PROJECT_A)).toMatchObject({
      committedBytes: BigInt(PROJECT_QUOTA_BYTES),
      activeReservationBytes: 0n,
      totalBytes: BigInt(PROJECT_QUOTA_BYTES),
    })
    const reservations = await admin.database
      .select({ id: documentUploadReservations.id })
      .from(documentUploadReservations)
      .where(eq(documentUploadReservations.tenant_id, TENANT_A))
    expect(reservations).toHaveLength(0)
  }, 30_000)
})
