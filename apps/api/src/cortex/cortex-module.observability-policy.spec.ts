import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { CortexModule } from './cortex.module'
import { CortexAssistantProviderCircuitAlertObservability } from './cortex-assistant-provider-circuit-alert.observability'

describe('Cortex operational snapshot module boundary', () => {
  it('registers the seam as a provider but never as an HTTP controller', () => {
    const controllers = Reflect.getMetadata('controllers', CortexModule) as
      | unknown[]
      | undefined
    const providers = Reflect.getMetadata('providers', CortexModule) as
      | unknown[]
      | undefined

    expect(providers).toContain(CortexAssistantProviderCircuitAlertObservability)
    expect(controllers).not.toContain(
      CortexAssistantProviderCircuitAlertObservability
    )
  })
})
