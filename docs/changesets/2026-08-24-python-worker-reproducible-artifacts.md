# Reproducible Python worker artifacts

## Scope

- aligned the AI and CAD workers with Python 3.12;
- pinned the official Python Alpine 3.23 base by immutable OCI index digest;
- installed runtime dependencies from hashed frozen exports;
- verified the LibreDWG 0.13.4 release tarball before extraction;
- changed both runtime images to unprivileged UID/GID 10001;
- added a fixed canonical digest for representative CAD extraction output;
- documented dependency, base, LibreDWG, verification, and rollback updates.
- added an immutable-SHA-pinned CI matrix for frozen tests, clean image builds,
  runtime smokes, SPDX SBOM generation, and fail-closed high/critical scans.

## Local evidence

- AI frozen tests: 8 passed;
- CAD frozen tests: 22 passed, including deterministic extraction digest
  `9c7ef2bb610b87471bccd101d412b71bde8714cdb6268462765e8ad916a76644`;
- two independent `--pull --no-cache` builds and runtime smokes passed for each
  worker;
- AI smokes: Python 3.12.14, UID 10001, application import;
- CAD smokes: Python 3.12.14, UID 10001, application import, LibreDWG 0.13.4;
- base index:
  `sha256:31a768b01976652c222e318fe5bd6e7c252f056cbf489c88fa256f1bf0af58e3`;
- uv 0.12.0 image:
  `sha256:606e70c71c852d03f611b1e56a195d08648507018a7057fab82c4974c4eae105`;
- LibreDWG 0.13.4 archive:
  `sha256:7e153ea4dac4cbf3dc9c50b9ef7a5604e09cdd4c5520bcf8017877bbe1422cd5`;
- independent SPDX dependency comparisons, excluding only the top-level image
  tag, found zero differences: AI 75 packages with identity digest
  `40124f9f63808c047e41ee2bf01a85a966bc49eec9a977b80beef86d84313747`;
  CAD 81 packages with identity digest
  `ee7c00b37eaec594b5e61c4edead2b40692a70add900fdaa166e1b7845c825d1`;
- Docker Scout 1.24.0 SARIF scans exited zero with no high or critical
  vulnerability detected in either final image;
- `verify:python-worker-artifacts`, actionlint 1.7.12, immutable action-reference
  reachability, and `git diff --check` passed;
- independent DevOps/release review found no P0-P2 defect and found no secret or
  local-path match in the generated artifacts.

The CI contract is source-verified but has not been executed on GitHub. No image
was published and no provider or deployment state changed.
