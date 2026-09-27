# Production cross-tenant project proof handoff

→ Handoff to Agent 13 and Agent 12. Reason: the new security observation is wired into the protected production promotion workflow. Inputs: `production-cross-tenant-isolation.spec.ts`, the exact synthetic fixture helper, workflow gate, and focused test evidence in the matching changeset. Expected output: review the release gate and execute it through the protected production workflow against the exact release revision. The retained owner-authorized `buildops-isolation-qa` project is the only permitted foreign target. If it is missing, deleted, or mislabeled, record the blocked result; do not substitute a customer project or fabricated pass. The original release check covered one resource and actor, so a wider 10-company matrix remains necessary for enterprise isolation claims.

## 2026-09-28 all-role extension

1. Agent 03 extended the protected browser check to all eleven seeded demo roles.
   Each role now proves its own project is readable through Web and RLS before
   proving the one synthetic foreign project is absent from both surfaces.
2. Agent 12 independently reviewed the scoped test. A failure could have put
   foreign HTML in the Playwright error report; body assertions now report
   booleans only. The revised live read-only test passed 1/1 with zero retries,
   as did Web type checking.
3. → Handoff to Agent 13 / release owner. Run exact-commit CI and the protected
   production workflow. This remains one foreign project in one direction;
   child resources, mutations, Core endpoints, and ten-company load are not
   covered by this test.
