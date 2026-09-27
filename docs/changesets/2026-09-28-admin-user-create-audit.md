# Admin user creation audit hardening

- Agent 03: changed workspace user creation to insert the tenant user and its append-only audit entry in one database transaction.
- If the transaction fails after Supabase Auth creation, the action attempts Auth compensation and reports an explicit reconciliation need when compensation fails. It no longer reports success after an audit failure.
- Focused tests cover successful paired writes, audit failure with Auth compensation, and failed compensation. The password reset path still has a separate remote-effect/audit uncertainty and is not covered by this change.
