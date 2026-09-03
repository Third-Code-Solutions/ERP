import 'reflect-metadata'

import { describe, expect, it } from 'vitest'
import { AccountsController } from '../crm/accounts.controller'
import { CortexAssistantGenerationController } from '../cortex/cortex-assistant-generation.controller'
import { CortexConversationsController } from '../cortex/cortex-conversations.controller'
import { CortexSemanticIndexController } from '../cortex/cortex-semantic-index.controller'
import { InventoryWarehouseCloseoutController } from '../inventory/inventory-warehouse-closeout.controller'
import { NotificationsController } from '../notifications/notifications.controller'

const CAPABILITIES_KEY = 'third-code-erp:capabilities'

function methodCapabilities(
  controller: object,
  method: string,
): readonly string[] | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(
    controller,
    method,
  )
  return descriptor?.value
    ? Reflect.getMetadata(CAPABILITIES_KEY, descriptor.value)
    : undefined
}

describe('Viewer read-only API capability seams', () => {
  it('uses dedicated read capabilities for sensitive tenant-safe projections', () => {
    expect(methodCapabilities(AccountsController.prototype, 'kycQueue')).toEqual([
      'account.kyc.read',
    ])
    expect(
      methodCapabilities(InventoryWarehouseCloseoutController.prototype, 'read'),
    ).toEqual(['inventory.closeout.read'])
    expect(
      methodCapabilities(CortexSemanticIndexController.prototype, 'status'),
    ).toEqual(['cortex.index.read'])
  })

  it('keeps Cortex writes distinct from conversation and job reads', () => {
    expect(
      methodCapabilities(CortexAssistantGenerationController.prototype, 'start'),
    ).toEqual(['cortex.assistant.use'])
    expect(
      methodCapabilities(CortexAssistantGenerationController.prototype, 'cancel'),
    ).toEqual(['cortex.assistant.use'])
    expect(
      methodCapabilities(CortexAssistantGenerationController.prototype, 'status'),
    ).toEqual(['cortex.search'])
    expect(
      methodCapabilities(CortexAssistantGenerationController.prototype, 'result'),
    ).toEqual(['cortex.search'])

    for (const method of ['appendUserTurn', 'claimAssistantTurn', 'completeAssistantTurn']) {
      expect(
        methodCapabilities(CortexConversationsController.prototype, method),
        method,
      ).toEqual(['cortex.assistant.use'])
    }
    for (const method of ['list', 'read']) {
      expect(
        methodCapabilities(CortexConversationsController.prototype, method),
        method,
      ).toEqual(['cortex.search'])
    }
  })

  it('overrides the notification read policy at its mutation method', () => {
    expect(
      Reflect.getMetadata(CAPABILITIES_KEY, NotificationsController),
    ).toEqual(['notification.read'])
    expect(
      methodCapabilities(NotificationsController.prototype, 'markReadState'),
    ).toEqual(['notification.manage'])
  })
})
