import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { accountKycDocumentQuerySchema, kycArtifactCreateCommandSchema, type AccountKycDocumentQuery, type KycArtifactCreateCommand } from '@third-code-erp/shared-types'

@Injectable()
export class KycArtifactCreatePipe implements PipeTransform<unknown, KycArtifactCreateCommand> {
  transform(value: unknown): KycArtifactCreateCommand {
    const parsed = kycArtifactCreateCommandSchema.safeParse(value)
    if (!parsed.success) throw new BadRequestException({ message: 'Invalid KYC artifact command', errors: parsed.error.flatten() })
    return parsed.data
  }
}

@Injectable()
export class AccountKycDocumentQueryPipe implements PipeTransform<unknown, AccountKycDocumentQuery> {
  transform(value: unknown): AccountKycDocumentQuery {
    const parsed = accountKycDocumentQuerySchema.safeParse(value)
    if (!parsed.success) throw new BadRequestException({ message: 'Invalid account document query', errors: parsed.error.flatten() })
    return parsed.data
  }
}
