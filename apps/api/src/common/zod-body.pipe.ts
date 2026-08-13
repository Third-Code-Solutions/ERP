import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import { z } from 'zod'

@Injectable()
export class ZodBodyPipe<TOutput>
  implements PipeTransform<unknown, TOutput>
{
  constructor(
    private readonly schema: z.ZodType<
      TOutput,
      z.ZodTypeDef,
      unknown
    >
  ) {}

  transform(value: unknown): TOutput {
    const parsed = this.schema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request body',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
