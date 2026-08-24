import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { z } from 'zod'

import type { Environment } from '../config/environment'

const DOCUSEAL_METADATA_MAX_BYTES = 256 * 1024
export const DOCUSEAL_PDF_MAX_BYTES = 25 * 1024 * 1024
const DOCUSEAL_REQUEST_TIMEOUT_MS = 15_000
const PDF_MAGIC = Buffer.from('%PDF-', 'ascii')

const documentMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    url: z.string().url().max(2_048),
  })
  .passthrough()

const documentResponseSchema = z.union([
  z.array(documentMetadataSchema).min(1),
  z
    .object({ documents: z.array(documentMetadataSchema).min(1) })
    .passthrough()
    .transform((response) => response.documents),
])

export type DownloadedDocuSealPdf = {
  name: string
  bytes: Buffer
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number
): Promise<Buffer> {
  const contentLength = response.headers.get('content-length')
  if (contentLength) {
    const parsedLength = Number(contentLength)
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maximumBytes
    ) {
      throw new ServiceUnavailableException(
        'DocuSeal returned an invalid or oversized response'
      )
    }
  }

  if (!response.body) {
    throw new ServiceUnavailableException('DocuSeal returned an empty response')
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let totalBytes = 0

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      totalBytes += chunk.value.byteLength
      if (totalBytes > maximumBytes) {
        throw new ServiceUnavailableException(
          'DocuSeal returned an oversized response'
        )
      }
      chunks.push(Buffer.from(chunk.value))
    }
  } finally {
    reader.releaseLock()
  }

  if (totalBytes === 0) {
    throw new ServiceUnavailableException('DocuSeal returned an empty response')
  }

  return Buffer.concat(chunks, totalBytes)
}

@Injectable()
export class DocuSealProviderService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async downloadCompletedPdf(
    submissionId: string
  ): Promise<DownloadedDocuSealPdf> {
    const apiUrl = this.config.get('DOCUSEAL_API_URL', { infer: true })
    const apiToken = this.config.get('DOCUSEAL_API_TOKEN', { infer: true })
    const documentHosts = this.config.get('DOCUSEAL_DOCUMENT_HOSTS', {
      infer: true,
    })

    if (!apiUrl || !apiToken || !documentHosts?.length) {
      throw new ServiceUnavailableException(
        'DocuSeal artifact retrieval is not configured'
      )
    }

    const baseUrl = new URL(apiUrl)
    if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/'
    const metadataUrl = new URL(
      `submissions/${encodeURIComponent(submissionId)}/documents?merge=true`,
      baseUrl
    )
    const metadataResponse = await this.fetchWithTimeout(metadataUrl, {
      headers: { 'X-Auth-Token': apiToken },
      redirect: 'error',
    })
    if (!metadataResponse.ok) {
      throw new ServiceUnavailableException(
        `DocuSeal document lookup failed with status ${metadataResponse.status}`
      )
    }

    const metadataBytes = await readBoundedBody(
      metadataResponse,
      DOCUSEAL_METADATA_MAX_BYTES
    )
    let metadataJson: unknown
    try {
      metadataJson = JSON.parse(metadataBytes.toString('utf8'))
    } catch {
      throw new ServiceUnavailableException(
        'DocuSeal returned invalid document metadata'
      )
    }

    const documents = documentResponseSchema.safeParse(metadataJson)
    if (!documents.success) {
      throw new ServiceUnavailableException(
        'DocuSeal returned invalid document metadata'
      )
    }

    const document = documents.data[0]
    if (!document) {
      throw new ServiceUnavailableException(
        'DocuSeal returned no completed document'
      )
    }
    const documentUrl = this.validateDocumentUrl(document.url, documentHosts)
    const documentResponse = await this.fetchWithTimeout(documentUrl, {
      redirect: 'error',
    })
    if (!documentResponse.ok) {
      throw new ServiceUnavailableException(
        `DocuSeal document download failed with status ${documentResponse.status}`
      )
    }

    const mediaType = documentResponse.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase()
    if (mediaType !== 'application/pdf') {
      throw new ServiceUnavailableException(
        'DocuSeal document did not use the PDF media type'
      )
    }

    const bytes = await readBoundedBody(
      documentResponse,
      DOCUSEAL_PDF_MAX_BYTES
    )
    if (
      bytes.length < PDF_MAGIC.length ||
      !bytes.subarray(0, 5).equals(PDF_MAGIC)
    ) {
      throw new ServiceUnavailableException(
        'DocuSeal document did not contain a valid PDF signature'
      )
    }

    return {
      name: document.name ?? `docuseal-${submissionId}.pdf`,
      bytes,
    }
  }

  private validateDocumentUrl(urlValue: string, allowedHosts: string[]): URL {
    const url = new URL(urlValue)
    const isDevelopmentHttp =
      this.config.get('NODE_ENV', { infer: true }) !== 'production' &&
      url.protocol === 'http:'
    if (
      (url.protocol !== 'https:' && !isDevelopmentHttp) ||
      url.username !== '' ||
      url.password !== '' ||
      !allowedHosts.some(
        (host) =>
          new URL(`${url.protocol}//${host}`).host.toLowerCase() ===
          url.host.toLowerCase()
      )
    ) {
      throw new ServiceUnavailableException(
        'DocuSeal returned a document URL outside the configured allowlist'
      )
    }
    return url
  }

  private async fetchWithTimeout(
    input: URL,
    init: Omit<RequestInit, 'signal'>
  ): Promise<Response> {
    try {
      return await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(DOCUSEAL_REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new ServiceUnavailableException('DocuSeal request failed')
    }
  }
}
