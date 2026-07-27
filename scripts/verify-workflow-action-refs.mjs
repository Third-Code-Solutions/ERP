#!/usr/bin/env node
/**
 * Verifies workflow action tags exist on api.github.com (public, unauthenticated).
 * The GitHub Actions VS Code/Cursor extension requires a signed-in GitHub session
 * for its language server to reach the API — this script only validates tags exist.
 */
import https from "node:https";

const REFS = [
  ["actions/checkout", "refs/tags/v4.3.1"],
  ["pnpm/action-setup", "refs/tags/v4.4.0"],
  ["actions/setup-node", "refs/tags/v4.4.0"],
  ["actions/upload-artifact", "refs/tags/v4.6.2"],
  ["gitleaks/gitleaks-action", "refs/tags/v2.3.9"],
];

function getStatus(repo, refPath) {
  const url = `https://api.github.com/repos/${repo}/git/${refPath}`;
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "third-code-erp-verify-workflow-refs",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      )
      .on("error", reject);
  });
}

const failures = [];
for (const [repo, refPath] of REFS) {
  const status = await getStatus(repo, refPath);
  const ref = `${repo}@${refPath.replace("refs/tags/", "")}`;
  console.log(`${status === 200 ? "PASS" : "FAIL"} ${ref} (${status})`);
  if (status !== 200) failures.push(ref);
}

if (failures.length > 0) {
  console.error(`Missing workflow action refs: ${failures.join(", ")}`);
  process.exitCode = 1;
}
