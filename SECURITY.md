# Security Policy

## Supported versions

`main` is the only supported line. Fixes are developed on `main` and deployed
from it; older branches and tags do not receive security patches.

## Reporting a vulnerability

Report suspected vulnerabilities privately through GitHub's private
vulnerability reporting flow: open the repository's **Security** tab and choose
**Report a vulnerability**.

Do **not** open a public issue for a security problem, and do not include live
credentials, customer data, or exploit details in public channels.

Please include: the affected component or path, the commit or deployment where
it was observed, an impact assessment, and reproduction steps or a proof of
concept.

## What to expect

- We aim to acknowledge a report within 3 business days.
- We triage, reproduce, and assign a severity. Cross-tenant data exposure,
  authentication bypass, and secret leaks are treated as SEV-1 by default.
- We coordinate the fix and, where relevant, a disclosure timeline with the
  reporter before any public write-up.

## Handling secrets

API keys, tokens, and credentials live only in Vercel/Railway environment
variables and the team vault — never in the repository, client bundles, or CI
logs. If you believe a secret has been committed, report it through the channel
above and rotate the credential immediately.
