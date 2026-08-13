type DeploymentEnvironment = {
  APP_REVISION?: string
  RAILWAY_GIT_COMMIT_SHA?: string
  VERCEL_GIT_COMMIT_SHA?: string
  VERCEL_DEPLOYMENT_ID?: string
  VERCEL_URL?: string
}

export function deploymentRevision(
  environment: DeploymentEnvironment = {
    APP_REVISION: process.env.APP_REVISION,
    RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
    VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    VERCEL_URL: process.env.VERCEL_URL,
  }
): string {
  const revision = [
    environment.APP_REVISION,
    environment.RAILWAY_GIT_COMMIT_SHA,
    environment.VERCEL_DEPLOYMENT_ID,
    environment.VERCEL_GIT_COMMIT_SHA,
    environment.VERCEL_URL,
  ].find((candidate) => candidate?.trim())

  return revision?.trim().slice(0, 12) || 'local'
}
