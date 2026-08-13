import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import { z } from 'zod'

@Injectable()
export class ZodQueryPipe<TOutput>
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
        message: 'Invalid query parameters',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
