import { Injectable, PayloadTooLargeException, RequestTimeoutException, ServiceUnavailableException, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'
import { finalize, type Observable } from 'rxjs'
import { MAX_INSPECTION_PHOTO_BYTES } from './inspection-photo-upload'

export const INSPECTION_PHOTO_INGRESS_MS = 90_000
export const INSPECTION_PHOTO_CONCURRENCY = 4
// Busboy emits partsLimit when the count reaches its limit, including the
// accepted file. Two permits one file; files/fields still reject every extra part.
const Multipart = FileInterceptor('file', { limits: { fileSize: MAX_INSPECTION_PHOTO_BYTES, files: 1, fields: 0, parts: 2, fieldNameSize: 32, headerPairs: 32 } })

@Injectable()
export class InspectionPhotoUploadInterceptor implements NestInterceptor {
  // Includes buffers retained through Storage and registration, not just parsing.
  private active = 0
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (this.active >= INSPECTION_PHOTO_CONCURRENCY) throw new ServiceUnavailableException('Photo upload capacity is busy; retry the same photo')
    this.active += 1
    let released = false
    const release = (): void => { if (!released) { released = true; this.active -= 1 } }
    const request = context.switchToHttp().getRequest<Request>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let received = 0
    let ingressError: Error | undefined
    const abortIngress = (error: Error): void => {
      if (ingressError) return
      ingressError = error
      // Multer owns Busboy/file streams and cancels them on request error/close.
      // Do not release admission until its parser promise has actually settled.
      request.destroy(error)
    }
    const countBytes = (chunk: Buffer): void => {
      received += chunk.length
      if (received > MAX_INSPECTION_PHOTO_BYTES + 64 * 1024) abortIngress(new PayloadTooLargeException('Multipart request is too large'))
    }
    try {
      timer = setTimeout(() => {
        abortIngress(new RequestTimeoutException('Photo upload ingress timed out; retry the same photo'))
      }, INSPECTION_PHOTO_INGRESS_MS)
      request.on('data', countBytes)
      const result = await new Multipart().intercept(context, next)
      if (ingressError) throw ingressError
      return result.pipe(finalize(release))
    } catch (error) {
      release()
      if (ingressError) throw ingressError
      if (request.destroyed && !request.complete) throw new RequestTimeoutException('Photo upload was interrupted; retry the same photo')
      throw error
    }
    finally { if (timer) clearTimeout(timer); request.off('data', countBytes) }
  }
}
