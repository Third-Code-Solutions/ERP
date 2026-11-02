import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  providerDeliveryAttempts,
  providerDeliveryOutbox,
  sapPostingAttempts,
  sapPostingOutbox,
  tenantFeatureFlags,
} from '@third-code-erp/database/schema'
import { and, asc, eq, lte } from 'drizzle-orm'
import { z } from 'zod'
import { DatabaseService } from '../database/database.service'
import { retryDelayMs } from '@third-code-erp/shared-types'

const MAX_ATTEMPTS = 5
const PROCESSING_LEASE_MS = 5 * 60_000
const UNCERTAIN_OUTCOME = 'OUTCOME_UNKNOWN: processing lease expired; reconcile provider receipt before any retry'

class RetryableProviderRejection extends Error {}

function rejectHttp(provider: string, status: number): never {
  // Only an explicit rate-limit rejection is safe to retry automatically.
  // A timeout/5xx can arrive after the provider has accepted the operation.
  if (status === 429) throw new RetryableProviderRejection(`${provider} returned HTTP 429`)
  throw new Error(`${provider} returned HTTP ${status}; reconcile provider outcome before retry`)
}

export interface ProviderSendInput {
  channel: 'email' | 'sms'
  provider: 'resend' | 'semaphore'
  recipient: string
  subject: string | null
  body: string
  idempotencyKey: string
}

export interface ProviderSendResult {
  messageId: string
  statusCode: number
}

export interface SapPostInput {
  aggregateType: string
  aggregateId: string
  postingType: string
  payload: Record<string, unknown>
  idempotencyKey: string
}

export interface SapPostResult {
  documentId: string
  statusCode: number
}

interface ProviderAdapter {
  send(input: ProviderSendInput): Promise<ProviderSendResult>
}

interface SapAdapter {
  post(input: SapPostInput): Promise<SapPostResult>
}

const resendResponseSchema = z.object({ id: z.string().min(1) }).strict()
const semaphoreResponseSchema = z.union([
  z.object({ message_id: z.union([z.string(), z.number()]) }).strict(),
  z.array(z.object({ message_id: z.union([z.string(), z.number()]) }).strict()).min(1),
])
const sapResponseSchema = z.object({
  documentId: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
}).refine((value) => Boolean(value.documentId ?? value.id), 'SAP response did not include a document id')

@Injectable()
export class ResendAndSemaphoreAdapter implements ProviderAdapter {
  constructor(private readonly config: ConfigService) {}

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    if (input.provider === 'resend') return this.sendEmail(input)
    return this.sendSms(input)
  }

  private async sendEmail(input: ProviderSendInput): Promise<ProviderSendResult> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')
    const from = this.config.get<string>('EMAIL_FROM')
    if (!apiKey || !from) throw new Error('Resend email delivery is not configured')
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.recipient],
        subject: input.subject ?? 'ABI OPS notification',
        text: input.body,
        html: `<p>${escapeHtml(input.body).replace(/\n/g, '<br>')}</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) rejectHttp('Resend', response.status)
    const parsed = resendResponseSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error('Resend returned an invalid message identifier')
    return { messageId: parsed.data.id, statusCode: response.status }
  }

  private async sendSms(input: ProviderSendInput): Promise<ProviderSendResult> {
    const apiKey = this.config.get<string>('SEMAPHORE_API_KEY')
    const senderName = this.config.get<string>('SEMAPHORE_SENDER_NAME')
    if (!apiKey || !senderName) throw new Error('Semaphore SMS delivery is not configured')
    const form = new URLSearchParams({
      apikey: apiKey,
      number: input.recipient,
      message: input.body,
      sendername: senderName,
    })
    const response = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': input.idempotencyKey },
      body: form,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) rejectHttp('Semaphore', response.status)
    const parsed = semaphoreResponseSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error('Semaphore returned an invalid message identifier')
    const first = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data
    if (!first) throw new Error('Semaphore returned no message identifier')
    return { messageId: String(first.message_id), statusCode: response.status }
  }
}

@Injectable()
export class SapHttpAdapter implements SapAdapter {
  constructor(private readonly config: ConfigService) {}

  async post(input: SapPostInput): Promise<SapPostResult> {
    const url = this.config.get<string>('SAP_API_URL')
    const token = this.config.get<string>('SAP_API_TOKEN')
    if (!url || !token) throw new Error('SAP posting is not configured')
    const response = await fetch(new URL('/postings', url).toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        postingType: input.postingType,
        payload: input.payload,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) rejectHttp('SAP', response.status)
    const parsed = sapResponseSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error('SAP returned an invalid posting identifier')
    return { documentId: parsed.data.documentId ?? parsed.data.id!, statusCode: response.status }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500)
  return 'External provider request failed'
}

@Injectable()
export class RoadmapIntegrationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly providers: ResendAndSemaphoreAdapter,
    private readonly sap: SapHttpAdapter,
  ) {}

  async sweepProviderDeliveries(limit = 50): Promise<number> {
    await this.recoverExpiredProviderClaims()
    let processed = 0
    while (processed < limit) {
      const claimed = await this.claimProviderDelivery()
      if (!claimed) break
      processed += 1
      try {
        const result = await this.providers.send({
          channel: claimed.channel === 'sms' ? 'sms' : 'email',
          provider: claimed.provider === 'semaphore' ? 'semaphore' : 'resend',
          recipient: claimed.recipient,
          subject: claimed.subject,
          body: claimed.body,
          idempotencyKey: claimed.idempotency_key,
        })
        await this.completeProviderDelivery(claimed.id, claimed.tenant_id, claimed.attempt_count, result)
      } catch (error) {
        await this.failProviderDelivery(claimed.id, claimed.tenant_id, claimed.attempt_count, error)
      }
    }
    return processed
  }

  async sweepSapPostings(limit = 50): Promise<number> {
    await this.recoverExpiredSapClaims()
    let processed = 0
    while (processed < limit) {
      const claimed = await this.claimSapPosting()
      if (!claimed) break
      processed += 1
      try {
        const result = await this.sap.post({
          aggregateType: claimed.aggregate_type,
          aggregateId: claimed.aggregate_id,
          postingType: claimed.posting_type,
          payload: claimed.payload as Record<string, unknown>,
          idempotencyKey: claimed.idempotency_key,
        })
        await this.completeSapPosting(claimed.id, claimed.tenant_id, claimed.attempt_count, result)
      } catch (error) {
        await this.failSapPosting(claimed.id, claimed.tenant_id, claimed.attempt_count, error)
      }
    }
    return processed
  }

  private async recoverExpiredProviderClaims(): Promise<void> {
    await this.database.client.transaction(async (transaction) => {
      const rows = await transaction.select().from(providerDeliveryOutbox)
        .where(and(eq(providerDeliveryOutbox.status, 'processing'), lte(providerDeliveryOutbox.updated_at, new Date(Date.now() - PROCESSING_LEASE_MS))))
        .limit(50).for('update', { skipLocked: true })
      for (const row of rows) {
        await transaction.update(providerDeliveryOutbox).set({ status: 'dead_letter', last_error: UNCERTAIN_OUTCOME, dead_lettered_at: new Date(), updated_at: new Date() }).where(and(eq(providerDeliveryOutbox.id, row.id), eq(providerDeliveryOutbox.tenant_id, row.tenant_id)))
        if (row.attempt_count > 0) await transaction.insert(providerDeliveryAttempts).values({ tenant_id: row.tenant_id, delivery_id: row.id, attempt_number: row.attempt_count, outcome: 'rejected', error: UNCERTAIN_OUTCOME })
      }
    })
  }

  private async recoverExpiredSapClaims(): Promise<void> {
    await this.database.client.transaction(async (transaction) => {
      const rows = await transaction.select().from(sapPostingOutbox)
        .where(and(eq(sapPostingOutbox.status, 'processing'), lte(sapPostingOutbox.updated_at, new Date(Date.now() - PROCESSING_LEASE_MS))))
        .limit(50).for('update', { skipLocked: true })
      for (const row of rows) {
        await transaction.update(sapPostingOutbox).set({ status: 'dead_letter', last_error: UNCERTAIN_OUTCOME, updated_at: new Date() }).where(and(eq(sapPostingOutbox.id, row.id), eq(sapPostingOutbox.tenant_id, row.tenant_id)))
        if (row.attempt_count > 0) await transaction.insert(sapPostingAttempts).values({ tenant_id: row.tenant_id, sap_posting_id: row.id, attempt_number: row.attempt_count, outcome: 'rejected', error: UNCERTAIN_OUTCOME })
      }
    })
  }

  private async claimProviderDelivery() {
    return this.database.client.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select({ delivery: providerDeliveryOutbox })
        .from(providerDeliveryOutbox)
        .innerJoin(
          tenantFeatureFlags,
          and(
            eq(tenantFeatureFlags.tenant_id, providerDeliveryOutbox.tenant_id),
            eq(tenantFeatureFlags.feature_key, 'provider_delivery'),
            eq(tenantFeatureFlags.enabled, true),
          ),
        )
        .where(and(eq(providerDeliveryOutbox.status, 'pending'), lte(providerDeliveryOutbox.next_attempt_at, new Date())))
        .orderBy(asc(providerDeliveryOutbox.next_attempt_at))
        .limit(1)
        .for('update', { skipLocked: true })
      const row = candidate?.delivery
      if (!row) return null
      const [claimed] = await transaction.update(providerDeliveryOutbox).set({ status: 'processing', attempt_count: row.attempt_count + 1, updated_at: new Date() }).where(and(eq(providerDeliveryOutbox.id, row.id), eq(providerDeliveryOutbox.status, 'pending'))).returning()
      return claimed ?? null
    })
  }

  private async completeProviderDelivery(id: string, tenantId: string, attempt: number, result: ProviderSendResult): Promise<void> {
    const responseHash = createHash('sha256').update(result.messageId).digest('hex')
    await this.database.client.transaction(async (transaction) => {
      const [updated] = await transaction.update(providerDeliveryOutbox).set({ status: 'delivered', provider_message_id: result.messageId, provider_response_code: result.statusCode, provider_response_hash: responseHash, delivered_at: new Date(), updated_at: new Date() }).where(and(eq(providerDeliveryOutbox.id, id), eq(providerDeliveryOutbox.tenant_id, tenantId), eq(providerDeliveryOutbox.status, 'processing'), eq(providerDeliveryOutbox.attempt_count, attempt))).returning({ id: providerDeliveryOutbox.id })
      if (!updated) return
      await transaction.insert(providerDeliveryAttempts).values({ tenant_id: tenantId, delivery_id: id, attempt_number: attempt, outcome: 'accepted', provider_status: result.statusCode, response_hash: responseHash, error: null })
    })
  }

  private async failProviderDelivery(id: string, tenantId: string, attempt: number, error: unknown): Promise<void> {
    const message = errorMessage(error)
    const terminal = attempt >= MAX_ATTEMPTS || !(error instanceof RetryableProviderRejection)
    await this.database.client.transaction(async (transaction) => {
      const [updated] = await transaction.update(providerDeliveryOutbox).set({ status: terminal ? 'dead_letter' : 'pending', next_attempt_at: new Date(Date.now() + retryDelayMs(attempt)), last_error: message, dead_lettered_at: terminal ? new Date() : null, updated_at: new Date() }).where(and(eq(providerDeliveryOutbox.id, id), eq(providerDeliveryOutbox.tenant_id, tenantId), eq(providerDeliveryOutbox.status, 'processing'), eq(providerDeliveryOutbox.attempt_count, attempt))).returning({ id: providerDeliveryOutbox.id })
      if (!updated) return
      await transaction.insert(providerDeliveryAttempts).values({ tenant_id: tenantId, delivery_id: id, attempt_number: attempt, outcome: terminal ? 'rejected' : 'retryable', provider_status: null, response_hash: null, error: message })
    })
  }

  private async claimSapPosting() {
    return this.database.client.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select({ posting: sapPostingOutbox })
        .from(sapPostingOutbox)
        .innerJoin(
          tenantFeatureFlags,
          and(
            eq(tenantFeatureFlags.tenant_id, sapPostingOutbox.tenant_id),
            eq(tenantFeatureFlags.feature_key, 'sap_posting'),
            eq(tenantFeatureFlags.enabled, true),
          ),
        )
        .where(and(eq(sapPostingOutbox.status, 'pending'), lte(sapPostingOutbox.next_attempt_at, new Date())))
        .orderBy(asc(sapPostingOutbox.next_attempt_at))
        .limit(1)
        .for('update', { skipLocked: true })
      const row = candidate?.posting
      if (!row) return null
      const [claimed] = await transaction.update(sapPostingOutbox).set({ status: 'processing', attempt_count: row.attempt_count + 1, updated_at: new Date() }).where(and(eq(sapPostingOutbox.id, row.id), eq(sapPostingOutbox.status, 'pending'))).returning()
      return claimed ?? null
    })
  }

  private async completeSapPosting(id: string, tenantId: string, attempt: number, result: SapPostResult): Promise<void> {
    await this.database.client.transaction(async (transaction) => {
      const [updated] = await transaction.update(sapPostingOutbox).set({ status: 'succeeded', provider_document_id: result.documentId, posted_at: new Date(), updated_at: new Date() }).where(and(eq(sapPostingOutbox.id, id), eq(sapPostingOutbox.tenant_id, tenantId), eq(sapPostingOutbox.status, 'processing'), eq(sapPostingOutbox.attempt_count, attempt))).returning({ id: sapPostingOutbox.id })
      if (!updated) return
      await transaction.insert(sapPostingAttempts).values({ tenant_id: tenantId, sap_posting_id: id, attempt_number: attempt, outcome: 'accepted', provider_status: result.statusCode, response: { documentId: result.documentId }, error: null })
    })
  }

  private async failSapPosting(id: string, tenantId: string, attempt: number, error: unknown): Promise<void> {
    const message = errorMessage(error)
    const terminal = attempt >= MAX_ATTEMPTS || !(error instanceof RetryableProviderRejection)
    await this.database.client.transaction(async (transaction) => {
      const [updated] = await transaction.update(sapPostingOutbox).set({ status: terminal ? 'dead_letter' : 'pending', next_attempt_at: new Date(Date.now() + retryDelayMs(attempt)), last_error: message, updated_at: new Date() }).where(and(eq(sapPostingOutbox.id, id), eq(sapPostingOutbox.tenant_id, tenantId), eq(sapPostingOutbox.status, 'processing'), eq(sapPostingOutbox.attempt_count, attempt))).returning({ id: sapPostingOutbox.id })
      if (!updated) return
      await transaction.insert(sapPostingAttempts).values({ tenant_id: tenantId, sap_posting_id: id, attempt_number: attempt, outcome: terminal ? 'rejected' : 'retryable', provider_status: null, response: null, error: message })
    })
  }
}
