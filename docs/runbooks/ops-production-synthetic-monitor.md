# Production synthetic monitor

The scheduled GitHub Actions monitor executes every 15 minutes against only
public, read-only health and readiness endpoints. It records no customer data,
credentials, sessions, or signed URLs. A nonzero run is an incident signal;
inspect the redacted JSON artifact and the provider health pages before taking
any corrective action.

The monitor verifies:

- Web `/api/health` identity and `/api/ready` database readiness.
- Core API health and Redis/database readiness.
- CAD worker health.

This is operational evidence, not a replacement for external incident paging.
Before a production launch, configure a named external on-call destination and
attach an alert-receipt test to the release record. Do not put provider tokens
or endpoint secrets in workflow logs or artifacts.
