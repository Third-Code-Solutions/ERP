#!/usr/bin/env node
/**
 * Verifies workflow action tags exist on api.github.com (public, unauthenticated).
 * The GitHub Actions VS Code/Cursor extension requires a signed-in GitHub session
 * for its language server to reach the API — this script only validates tags exist.
 */
import fs from "node:fs";
import https from "node:https";

const LOG = new URL("../.cursor/debug-2cc198.log", import.meta.url);
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
            "User-Agent": "buildops-verify-workflow-refs",
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

function appendLog(obj) {
  fs.appendFileSync(LOG, `${JSON.stringify(obj)}\n`);
}

for (const [repo, refPath] of REFS) {
  const status = await getStatus(repo, refPath);
  appendLog({
    sessionId: "2cc198",
    timestamp: Date.now(),
    location: "scripts/verify-workflow-action-refs.mjs",
    message: "github tag ref",
    data: { repo, refPath, httpStatus: status },
    hypothesisId: "H-tags-exist-on-github",
  });
}

appendLog({
  sessionId: "2cc198",
  timestamp: Date.now(),
  location: "verify-workflow-action-refs.mjs:summary",
  message:
    "Extension auth: github/vscode-github-actions canReachGitHubAPI() returns false when getSession() is undefined (not signed in), so getGitHubContext() aborts and the Actions language server resolves no actions.",
  data: { source: "https://github.com/github/vscode-github-actions/blob/main/src/api/canReachGitHubAPI.ts" },
  hypothesisId: "H-ls-requires-github-signin",
});

console.log(`Wrote ${REFS.length + 1} lines to ${LOG.pathname}`);
