#!/usr/bin/env node
/** Verifies that pinned workflow action tags resolve through the GitHub API. */
import https from "node:https";
import { pathToFileURL } from "node:url";

export const REFS = [
  ["actions/checkout", "refs/tags/v4.3.1"],
  ["pnpm/action-setup", "refs/tags/v4.4.0"],
  ["actions/setup-node", "refs/tags/v4.4.0"],
  ["actions/upload-artifact", "refs/tags/v4.6.2"],
];

export function getStatus(
  repo,
  refPath,
  { token = process.env.GITHUB_TOKEN, request = https.get, timeoutMs = 10_000 } = {},
) {
  const url = `https://api.github.com/repos/${repo}/git/${refPath}`;
  return new Promise((resolve, reject) => {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "third-code-erp-verify-workflow-refs",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = request(url, { headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`GitHub API request timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
  });
}

export async function verifyWorkflowActionRefs({
  refs = REFS,
  statusFor = getStatus,
  log = console.log,
  error = console.error,
} = {}) {
  const failures = [];
  for (const [repo, refPath] of refs) {
    const ref = `${repo}@${refPath.replace("refs/tags/", "")}`;
    try {
      const status = await statusFor(repo, refPath);
      if (status === 200) {
        log(`PASS ${ref} (200)`);
        continue;
      }
      const reason = status === 404 ? "missing" : `GitHub API unavailable (${status})`;
      error(`FAIL ${ref}: ${reason}`);
      failures.push(ref);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "unknown request failure";
      error(`FAIL ${ref}: GitHub API unavailable (${message})`);
      failures.push(ref);
    }
  }

  if (failures.length > 0) {
    error(`Workflow action refs could not be verified: ${failures.join(", ")}`);
    return false;
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!(await verifyWorkflowActionRefs())) process.exitCode = 1;
}
