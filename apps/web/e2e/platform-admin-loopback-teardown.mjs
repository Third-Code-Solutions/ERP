// Playwright calls global teardown before terminating webServer. Windows taskkill
// does not deliver Node SIGTERM, so signal handlers alone cannot clean fixtures.
export default async function teardown() {
  const response = await fetch('http://127.0.0.1:4418/__fixture/cleanup', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok || (await response.json()).cleaned !== true) {
    throw new Error('Disposable platform browser fixture cleanup failed')
  }
}
