import {
  BadRequestException,
  type PipeTransform,
} from '@nestjs/common'
import type { z } from 'zod'

export class PlatformValidationPipe<Output>
  implements PipeTransform<unknown, Output>
{
  constructor(
    private readonly schema: z.ZodType<Output>,
    private readonly label: string
  ) {}

  transform(value: unknown): Output {
    const parsed = this.schema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: `Invalid ${this.label}`,
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
