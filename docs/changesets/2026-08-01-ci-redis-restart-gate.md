# CI Redis restart gate

The two integration tests that restart Redis through the repository's WSL
distribution are now gated on both `ERP_REDIS_RESTART_EXPECTED=1` and
`ERP_REDIS_TEST_DISTRIBUTION`. GitHub-hosted Linux continues to run the normal
BullMQ/Redis integration suite without attempting a nonexistent WSL path; the
free self-hosted WSL lane still runs the restart recovery proof.
