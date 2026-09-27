# Operations package container wiring

The Core and Web Docker build stages now include the new
`@third-code-erp/operations` workspace manifest, and the Core build stage
copies its source. Railway's API watch list and source comparison now include
`packages/operations`, so a future award-rule change cannot reuse an old
container as though its inputs were unchanged.

Verification: the Railway deployment contract test passed 8/8, and a complete
local Core Docker image built successfully with a frozen production install.
The exact-commit CI container smoke remains pending. No hosted deployment or
schema migration occurred.
