# All-role synthetic project isolation gate

- Extend the protected read-only cross-tenant project check from viewer to all
  eleven seeded demo roles, with each role proving its own project control
  route, an empty foreign-project RLS query, and a Web not-found response.
- Keep the test restricted to the dedicated demo and separately approved
  synthetic isolation project; screenshots and traces remain disabled so a
  failed response cannot disclose project content in artifacts.
