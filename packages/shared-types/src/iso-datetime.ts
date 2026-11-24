import { z } from 'zod'

// zod 3's ISO datetime rule, kept exact through the zod 4 upgrade: seconds are
// optional and an offset may omit its colon (+0800). zod 4's .datetime() follows
// RFC 3339 and rejects both, so swapping it in would change what inputs pass.
const DATE =
  '((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))'
const TIME = '([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d(\\.\\d+)?)?'

export const ISO_DATETIME_UTC = new RegExp(`^${DATE}T${TIME}(Z)$`)
export const ISO_DATETIME_OFFSET = new RegExp(`^${DATE}T${TIME}(Z|([+-]\\d{2}:?\\d{2}))$`)

/** An ISO datetime string: UTC (`Z`) only, or also with an offset when `offset` is set. */
export function isoDateTimeString(options: { offset?: boolean; message?: string } = {}) {
  return z
    .string()
    .regex(options.offset ? ISO_DATETIME_OFFSET : ISO_DATETIME_UTC, options.message ?? 'Invalid datetime')
}
