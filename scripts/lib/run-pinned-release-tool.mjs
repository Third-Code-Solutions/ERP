import { createHash } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { spawnSync } from 'node:child_process'

function assertSupportedPlatform(assets) {
  if (process.arch !== 'x64') {
    throw new Error(`Unsupported architecture: ${process.arch}`)
  }

  const asset = assets[process.platform]
  if (!asset) {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }

  return asset
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`)
  }
}

export async function runPinnedReleaseTool({
  name,
  repository,
  version,
  assets,
  executable,
  args,
}) {
  const asset = assertSupportedPlatform(assets)
  const archive = asset.filename
  const url =
    `https://github.com/${repository}/releases/download/v${version}/${archive}`
  const temporaryDirectory = await mkdtemp(join(tmpdir(), `${name}-`))
  const archivePath = join(temporaryDirectory, archive)

  try {
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
    }

    await writeFile(archivePath, Buffer.from(await response.arrayBuffer()))
    const digest = createHash('sha256')
      .update(await readFile(archivePath))
      .digest('hex')
    if (digest !== asset.sha256) {
      throw new Error(
        `${archive} SHA-256 mismatch: expected ${asset.sha256}, got ${digest}`
      )
    }

    const extractArgs = archive.endsWith('.zip')
      ? ['-xf', archivePath, '-C', temporaryDirectory]
      : ['-xzf', archivePath, '-C', temporaryDirectory]
    run('tar', extractArgs)

    const executablePath = join(
      temporaryDirectory,
      process.platform === 'win32' ? `${executable}.exe` : executable
    )
    if (process.platform !== 'win32') await chmod(executablePath, 0o755)

    console.log(
      `PASS ${name} ${version} artifact ${basename(archive)} sha256:${digest}`
    )
    run(executablePath, args)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}
