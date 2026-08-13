import { z } from 'zod'

/**
 * Exact DUPA arithmetic. Money is bigint centavos; measured quantities are
 * decimal strings so JavaScript floating-point values never enter the
 * cascade.
 */

export const dupaVatBaseSchema = z.enum(['direct_only', 'direct_plus_indirect'])
export type DupaVatBase = z.infer<typeof dupaVatBaseSchema>

export interface DupaMaterialInput {
  quantity: string
  unitRateCentavos: bigint
}

export interface DupaLabourInput {
  noOfPersons: string
  hourlyRateCentavos: bigint
  productivityPerHour: string
}

export interface DupaEquipmentInput {
  noOfUnits: string
  hourlyRateCentavos: bigint
  productivityPerHour: string
}

export interface DupaInput {
  headerQuantity: string
  materials?: readonly DupaMaterialInput[]
  labour?: readonly DupaLabourInput[]
  equipment?: readonly DupaEquipmentInput[]
  ocmBps?: bigint
  profitBps?: bigint
  vatBps?: bigint
  vatBase?: DupaVatBase
}

export interface DupaComputation {
  materialSubtotalCentavos: bigint
  labourSubtotalCentavos: bigint
  equipmentSubtotalCentavos: bigint
  directCostCentavos: bigint
  indirectCostCentavos: bigint
  vatCentavos: bigint
  totalCostCentavos: bigint
  unitRateCentavos: bigint
  vatBase: DupaVatBase
}

interface Rational {
  numerator: bigint
  denominator: bigint
}

const BASIS_POINT_SCALE = 10_000n

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left
  let b = right < 0n ? -right : right
  while (b !== 0n) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a === 0n ? 1n : a
}

function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error('DUPA rational denominator must be non-zero')
  const sign = denominator < 0n ? -1n : 1n
  const divisor = gcd(numerator, denominator)
  return {
    numerator: (numerator / divisor) * sign,
    denominator: (denominator / divisor) * sign,
  }
}

function add(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  )
}

function multiply(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator)
}

function divide(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.denominator, left.denominator * right.numerator)
}

function parseDecimal(value: string, field: string): Rational {
  const normalized = value.trim()
  const match = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.exec(normalized)
  if (!match) throw new Error(`${field} must be a non-negative decimal string`)

  const [whole, fraction = ''] = normalized.split('.')
  const scale = 10n ** BigInt(fraction.length)
  return rational(BigInt(whole + fraction), scale)
}

function validateBps(value: bigint, field: string): void {
  if (value < 0n || value > BASIS_POINT_SCALE) {
    throw new Error(`${field} must be between 0 and 10000 basis points`)
  }
}

function roundHalfUp(value: Rational): bigint {
  if (value.numerator < 0n) throw new Error('DUPA monetary values cannot be negative')
  const whole = value.numerator / value.denominator
  const remainder = value.numerator % value.denominator
  return whole + (remainder * 2n >= value.denominator ? 1n : 0n)
}

function sum(values: readonly Rational[]): Rational {
  return values.reduce((total, value) => add(total, value), rational(0n))
}

function percentage(value: Rational, basisPoints: bigint): Rational {
  return multiply(value, rational(basisPoints, BASIS_POINT_SCALE))
}

function materialAmount(line: DupaMaterialInput): Rational {
  if (line.unitRateCentavos < 0n) throw new Error('Material unit rate cannot be negative')
  return multiply(parseDecimal(line.quantity, 'material quantity'), rational(line.unitRateCentavos))
}

function labourOrEquipmentAmount(
  count: string,
  hourlyRateCentavos: bigint,
  productivityPerHour: string,
  label: string,
): Rational {
  if (hourlyRateCentavos < 0n) throw new Error(`${label} hourly rate cannot be negative`)
  const productivity = parseDecimal(productivityPerHour, `${label} productivity per hour`)
  if (productivity.numerator <= 0n) {
    throw new Error(`${label} productivity per hour must be greater than zero`)
  }
  return divide(
    multiply(parseDecimal(count, `${label} count`), rational(hourlyRateCentavos)),
    productivity,
  )
}

/** Compute the canonical DUPA cascade without rounding intermediate values. */
export function computeDupa(input: DupaInput): DupaComputation {
  const headerQuantity = parseDecimal(input.headerQuantity, 'header quantity')
  if (headerQuantity.numerator <= 0n) throw new Error('header quantity must be greater than zero')

  const ocmBps = input.ocmBps ?? 800n
  const profitBps = input.profitBps ?? 700n
  const vatBps = input.vatBps ?? 1200n
  const vatBase = input.vatBase ?? 'direct_only'
  validateBps(ocmBps, 'OCM')
  validateBps(profitBps, 'profit')
  validateBps(vatBps, 'VAT')
  dupaVatBaseSchema.parse(vatBase)

  const material = sum((input.materials ?? []).map(materialAmount))
  const labour = sum(
    (input.labour ?? []).map((line) =>
      labourOrEquipmentAmount(
        line.noOfPersons,
        line.hourlyRateCentavos,
        line.productivityPerHour,
        'Labour',
      ),
    ),
  )
  const equipment = sum(
    (input.equipment ?? []).map((line) =>
      labourOrEquipmentAmount(
        line.noOfUnits,
        line.hourlyRateCentavos,
        line.productivityPerHour,
        'Equipment',
      ),
    ),
  )
  const direct = add(add(material, labour), equipment)
  const indirect = add(percentage(direct, ocmBps), percentage(direct, profitBps))
  const vatBaseAmount = vatBase === 'direct_only' ? direct : add(direct, indirect)
  const vat = percentage(vatBaseAmount, vatBps)
  const total = add(add(direct, indirect), vat)
  const unitRate = divide(total, headerQuantity)

  return {
    materialSubtotalCentavos: roundHalfUp(material),
    labourSubtotalCentavos: roundHalfUp(labour),
    equipmentSubtotalCentavos: roundHalfUp(equipment),
    directCostCentavos: roundHalfUp(direct),
    indirectCostCentavos: roundHalfUp(indirect),
    vatCentavos: roundHalfUp(vat),
    totalCostCentavos: roundHalfUp(total),
    unitRateCentavos: roundHalfUp(unitRate),
    vatBase,
  }
}

/** BOQ amounts must derive from persisted H, never from persisted G. */
export function deriveBoqLineAmount(unitRateCentavos: bigint, quantity: string): bigint {
  if (unitRateCentavos < 0n) throw new Error('BOQ unit rate cannot be negative')
  return roundHalfUp(multiply(rational(unitRateCentavos), parseDecimal(quantity, 'BOQ quantity')))
}

/** Rejects a typed or G-sourced value at the BOQ boundary. */
export function assertBoqUnitRate(
  persistedDupa: Pick<DupaComputation, 'unitRateCentavos'>,
  proposedUnitRateCentavos: bigint,
): void {
  if (proposedUnitRateCentavos !== persistedDupa.unitRateCentavos) {
    throw new Error('BOQ unit rate must equal the persisted DUPA H unit rate')
  }
}
