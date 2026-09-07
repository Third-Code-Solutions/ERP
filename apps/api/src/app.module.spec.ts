import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { AppModule } from './app.module'
import { ProcessModule } from './process/process.module'
import { ProcessController } from './process/process.controller'

// This checks production composition without opening infrastructure connections.
// Environment validation has its own tests; no provider is instantiated here.
vi.mock('./config/environment', async (importOriginal) => {
  const original = await importOriginal<typeof import('./config/environment')>()
  return {
    ...original,
    validateEnvironment: (environment: Record<string, unknown>) => environment,
  }
})

describe('Core API production route composition', () => {
  it('mounts Process Health through the actual application module', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', AppModule)
    const controllers: unknown[] = Reflect.getMetadata('controllers', ProcessModule)

    expect(imports).toContain(ProcessModule)
    expect(controllers).toContain(ProcessController)
    expect(Reflect.getMetadata('path', ProcessController)).toBe('v1/process')
    expect(Reflect.getMetadata('path', ProcessController.prototype.health)).toBe('health')
  })
})
