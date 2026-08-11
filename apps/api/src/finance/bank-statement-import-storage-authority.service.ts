import { randomUUID } from 'node:crypto'
import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  bankStatementImportStorageCleanupBodySchema,
  bankStatementImportStorageCleanupResultSchema,
  bankStatementImportUploadSignBodySchema,
  bankStatementImportUploadSignResultSchema,
  type BankStatementImportStorageCleanupBody,
  type BankStatementImportStorageCleanupResult,
  type BankStatementImportUploadSignBody,
  type BankStatementImportUploadSignResult,
} from '@third-code-erp/shared-types'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

const DOCUMENTS_BUCKET = 'documents'
const UUID_IN_BANK_STATEMENT_PATH =
  /\/bank-statements\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-|\/|$)/i

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
}

function storageEntityId(storagePath: string, tenantId: string): string {
  return storagePath.match(UUID_IN_BANK_STATEMENT_PATH)?.[1] ?? tenantId
}

/**
 * Nest authority for bank-statement signed upload and cleanup. It owns the
 * tenant/capability/feature checks and audit boundary; browser clients never
 * receive a service-role key.
 */
@Injectable()
export class BankStatementImportStorageAuthorityService {
  private client: SupabaseClient | null = null

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async createSignedUpload(
    body: BankStatementImportUploadSignBody,
    principal: ErpPrincipal
  ): Promise<BankStatementImportUploadSignResult> {
    const command = bankStatementImportUploadSignBodySchema.parse(body)
    this.assertAuthorized(principal)

    const storagePath = `${principal.tenantId}/bank-statements/${randomUUID()}-${safeFileName(command.fileName)}`
    const { data, error } = await this.clientOrThrow().storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storagePath)
    if (error || !data?.signedUrl || !data.token) {
      throw new ServiceUnavailableException(
        'Failed to create bank statement upload URL'
      )
    }

    await this.writeAudit(principal, {
      operation: 'signed_upload_url_created',
      file_name: command.fileName,
      size_bytes: command.sizeBytes,
      storage_path: storagePath,
    }, storagePath, 'query')

    return bankStatementImportUploadSignResultSchema.parse({
      signedUrl: data.signedUrl,
      token: data.token,
      storagePath,
      originalFileName: command.fileName,
    })
  }

  async cleanup(
    body: BankStatementImportStorageCleanupBody,
    principal: ErpPrincipal
  ): Promise<BankStatementImportStorageCleanupResult> {
    const command = bankStatementImportStorageCleanupBodySchema.parse(body)
    this.assertAuthorized(principal)
    const expectedPrefix = `${principal.tenantId}/bank-statements/`
    if (
      !command.storagePath.startsWith(expectedPrefix) ||
      command.storagePath.includes('..')
    ) {
      throw new ForbiddenException('Storage path is outside tenant scope')
    }

    await this.writeAudit(principal, {
      operation: 'signed_upload_source_cleanup_requested',
      storage_path: command.storagePath,
    }, command.storagePath, 'delete')

    const { error } = await this.clientOrThrow().storage
      .from(DOCUMENTS_BUCKET)
      .remove([command.storagePath])
    if (error) {
      throw new ServiceUnavailableException(
        'Failed to clean up bank statement source'
      )
    }
    return bankStatementImportStorageCleanupResultSchema.parse({ ok: true })
  }

  private assertAuthorized(principal: ErpPrincipal): void {
    if (!roleHasCapability(principal.role, 'finance.manage_cash')) {
      throw new ForbiddenException()
    }
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_ENABLED',
      false
    )
    const tenantIds = this.config.get<string[]>(
      'ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_TENANT_IDS',
      []
    )
    if (!enabled || !tenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Bank statement Storage authority is not enabled for this tenant.'
      )
    }
  }

  private async writeAudit(
    principal: ErpPrincipal,
    diff: Record<string, unknown>,
    storagePath: string,
    action: 'delete' | 'query'
  ): Promise<void> {
    await this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)
      await this.audit.writeSemantic(transaction, {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        entityType: 'bank_statement_upload',
        entityId: storageEntityId(storagePath, principal.tenantId),
        action,
        diff,
      })
    })
  }

  private clientOrThrow(): SupabaseClient {
    if (this.client) return this.client
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      throw new ServiceUnavailableException('Storage credentials unavailable')
    }
    this.client = createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    return this.client
  }
}
