import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common'
import {
  documentUploadIdempotencyKeySchema,
  type DocumentUploadReservationCompletionResult,
  type DocumentUploadReservationMutationBody,
  type DocumentUploadReservationReleaseResult,
  type DocumentUploadReservationRequest,
  type DocumentUploadReservationResult,
} from '@third-code-erp/shared-types'
import type { Response } from 'express'

import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  DocumentUploadReservationMutationPipe,
  DocumentUploadReservationPipe,
} from './document-upload-reservation.pipe'
import { DocumentUploadReservationService } from './document-upload-reservation.service'

@Controller('v1/document-upload-reservations')
export class DocumentUploadReservationController {
  constructor(
    @Inject(DocumentUploadReservationService)
    private readonly reservations: DocumentUploadReservationService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('document.manage')
  async reserve(
    @Body(DocumentUploadReservationPipe)
    request: DocumentUploadReservationRequest,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
    @Res({ passthrough: true }) response: Response
  ): Promise<DocumentUploadReservationResult> {
    const idempotencyKey = documentUploadIdempotencyKeySchema.safeParse(
      rawIdempotencyKey
    )
    if (!idempotencyKey.success) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const result = await this.reservations.reserve(
      request,
      principal,
      idempotencyKey.data
    )
    response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED)
    return result
  }

  @Post(':reservationId/complete')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('document.manage')
  complete(
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
    @Body(DocumentUploadReservationMutationPipe)
    _body: DocumentUploadReservationMutationBody,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DocumentUploadReservationCompletionResult> {
    return this.reservations.complete(reservationId, principal)
  }

  @Delete(':reservationId')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('document.manage')
  release(
    @Param('reservationId', new ParseUUIDPipe({ version: '4' }))
    reservationId: string,
    @Body(DocumentUploadReservationMutationPipe)
    _body: DocumentUploadReservationMutationBody,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DocumentUploadReservationReleaseResult> {
    return this.reservations.release(reservationId, principal)
  }
}
