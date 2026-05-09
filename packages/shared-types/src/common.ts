import { z } from 'zod'

// Branded types for monetary safety
export type Cents = number & { readonly __brand: 'Cents' }
export type BasisPoints = number & { readonly __brand: 'BasisPoints' }

export function toCents(n: number): Cents {
  return n as Cents
}

export function toBasisPoints(n: number): BasisPoints {
  return n as BasisPoints
}

// PHP currency formatting (Asia/Manila locale)
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('fil-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatCentsCompact(cents: number): string {
  const php = cents / 100
  if (Math.abs(php) >= 1_000_000) {
    return `₱${(php / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(php) >= 1_000) {
    return `₱${(php / 1_000).toFixed(0)}K`
  }
  return formatCents(cents)
}

export function formatBasisPoints(bps: number, decimals = 1): string {
  return `${(bps / 100).toFixed(decimals)}%`
}

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export type Pagination = z.infer<typeof paginationSchema>

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// Standard API response envelope
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}
