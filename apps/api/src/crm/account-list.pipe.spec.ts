import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { AccountListPipe } from './account-list.pipe'

describe('AccountListPipe', () => {
  it('normalizes bounded account filters', () => {
    expect(new AccountListPipe().transform({ q: ' Acme ', page: '2' })).toEqual({
      q: 'Acme',
      sort: 'created_at',
      order: 'desc',
      page: 2,
      limit: 20,
    })
  })

  it('rejects unsupported account query fields', () => {
    expect(() => new AccountListPipe().transform({ cursor: 'bad' })).toThrow(
      BadRequestException
    )
  })
})
