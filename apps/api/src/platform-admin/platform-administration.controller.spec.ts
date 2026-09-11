import 'reflect-metadata'

import { RequestMethod } from '@nestjs/common'
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'

import {
  PLATFORM_ROUTE,
  PlatformOwnerGuard,
} from '../auth/platform-owner.guard'
import { PlatformAdministrationController } from './platform-administration.controller'

describe('PlatformAdministrationController security contract', () => {
  it('marks the entire controller as platform-only and independently guarded', () => {
    expect(
      Reflect.getMetadata(PLATFORM_ROUTE, PlatformAdministrationController)
    ).toBe(true)
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PlatformAdministrationController)
    ).toContain(PlatformOwnerGuard)
    expect(
      Reflect.getMetadata(PATH_METADATA, PlatformAdministrationController)
    ).toBe('v1/platform-admin')
  })

  it.each([
    ['overview', '/', RequestMethod.GET],
    ['tenants', 'tenants', RequestMethod.GET],
    ['users', 'users', RequestMethod.GET],
    ['roles', 'roles', RequestMethod.GET],
    ['analytics', 'analytics', RequestMethod.GET],
    ['operationalAnalytics', 'analytics/operations', RequestMethod.GET],
    ['audit', 'audit', RequestMethod.GET],
    ['integrations', 'integrations', RequestMethod.GET],
    ['systemHealth', 'system-health', RequestMethod.GET],
  ] as const)('exposes %s at the reviewed read path', (method, path, verb) => {
    const handler = PlatformAdministrationController.prototype[method]
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path)
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(verb)
  })
})
