const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1'])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function fail(message) {
  throw new Error(`FAIL local Supabase containment: ${message}`)
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535
}

function validNetwork(network) {
  return (
    network &&
    typeof network.id === 'string' &&
    network.id.length > 0 &&
    typeof network.name === 'string' &&
    network.name.length > 0
  )
}

/**
 * Validates only non-secret Docker publication and Windows listener evidence.
 * Runtime URLs and credentials are deliberately outside this contract.
 */
export function validateSupabaseContainment(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    fail('evidence must be an object')
  }
  if (!validNetwork(evidence.network)) {
    fail('exact Docker network identity is missing')
  }

  const containers = asArray(evidence.containers)
  const mappings = asArray(evidence.mappings)
  const listeners = asArray(evidence.listeners)
  const requiredHostPorts = asArray(evidence.requiredHostPorts)

  if (containers.length === 0) {
    fail('no run-owned containers were discovered on the exact network')
  }
  if (mappings.length === 0) {
    fail('no published mappings were discovered')
  }

  const containerIds = new Set()
  for (const container of containers) {
    if (
      !container ||
      typeof container.id !== 'string' ||
      container.id.length === 0 ||
      typeof container.name !== 'string' ||
      container.name.length === 0 ||
      typeof container.image !== 'string' ||
      container.image.length === 0
    ) {
      fail('container identity is incomplete')
    }
    if (containerIds.has(container.id)) {
      fail('duplicate run-owned container identity')
    }
    containerIds.add(container.id)

    const attached = asArray(container.networks).some(
      (network) =>
        network?.id === evidence.network.id && network?.name === evidence.network.name,
    )
    if (!attached) {
      fail(`container ${container.name} is not attached to the exact generated network`)
    }
  }

  const mappingKeys = new Set()
  const hostPortOwners = new Set()
  const expectedListenerAddresses = new Map()
  for (const mapping of mappings) {
    if (!mapping || !containerIds.has(mapping.containerId)) {
      fail('a published mapping is not attributable to a run-owned container')
    }
    if (
      typeof mapping.containerPort !== 'string' ||
      !/^\d+\/(tcp|udp)$/i.test(mapping.containerPort) ||
      typeof mapping.hostIp !== 'string' ||
      !validPort(mapping.hostPort)
    ) {
      fail('a published mapping is malformed')
    }
    if (!LOOPBACK_HOSTS.has(mapping.hostIp)) {
      fail(`published host binding ${mapping.hostIp} is not loopback-only`)
    }

    const mappingKey = [
      mapping.containerId,
      mapping.containerPort,
      mapping.hostIp,
      mapping.hostPort,
    ].join('|')
    if (mappingKeys.has(mappingKey)) {
      fail('duplicate published mapping is ambiguous')
    }
    mappingKeys.add(mappingKey)

    const hostPortOwner = `${mapping.hostIp}|${mapping.hostPort}`
    if (hostPortOwners.has(hostPortOwner)) {
      fail('multiple containers claim the same host binding')
    }
    hostPortOwners.add(hostPortOwner)

    if (!expectedListenerAddresses.has(mapping.hostPort)) {
      expectedListenerAddresses.set(mapping.hostPort, new Set())
    }
    expectedListenerAddresses.get(mapping.hostPort).add(mapping.hostIp)
  }

  const listenersByPort = new Map()
  for (const listener of listeners) {
    if (
      !listener ||
      listener.protocol !== 'TCP' ||
      listener.state !== 'Listen' ||
      !validPort(listener.hostPort) ||
      typeof listener.localAddress !== 'string'
    ) {
      fail('host listener metadata is malformed')
    }
    if (!expectedListenerAddresses.has(listener.hostPort)) {
      fail('host listener evidence contains an uninspected port')
    }
    if (!LOOPBACK_HOSTS.has(listener.localAddress)) {
      fail(`host listener ${listener.localAddress} is not loopback-only`)
    }
    if (!listenersByPort.has(listener.hostPort)) {
      listenersByPort.set(listener.hostPort, new Set())
    }
    const addresses = listenersByPort.get(listener.hostPort)
    if (addresses.has(listener.localAddress)) {
      fail('duplicate host listener evidence is ambiguous')
    }
    addresses.add(listener.localAddress)
  }

  for (const [hostPort, expectedAddresses] of expectedListenerAddresses) {
    const observedAddresses = listenersByPort.get(hostPort)
    if (!observedAddresses) {
      fail(`published host port ${hostPort} has no TCP listener evidence`)
    }
    if (
      observedAddresses.size !== expectedAddresses.size ||
      [...expectedAddresses].some((address) => !observedAddresses.has(address))
    ) {
      fail(`host listener evidence does not reconcile with Docker metadata on port ${hostPort}`)
    }
  }

  const required = new Set()
  for (const hostPort of requiredHostPorts) {
    if (!validPort(hostPort)) {
      fail('required host-port configuration is malformed')
    }
    if (required.has(hostPort)) {
      fail('required host-port configuration is ambiguous')
    }
    required.add(hostPort)
  }
  for (const hostPort of required) {
    if (!expectedListenerAddresses.has(hostPort)) {
      fail(`required API or database host port ${hostPort} is not published`)
    }
  }

  return {
    bindingCount: mappings.length,
    containerCount: containers.length,
    hostPortCount: expectedListenerAddresses.size,
  }
}
