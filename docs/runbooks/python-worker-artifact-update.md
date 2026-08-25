# Python worker artifact update

## Scope

This procedure updates the reproducible local artifacts for
`apps/workers/ai` and `apps/workers/dxf-parser`. It does not authorize image
publication, Railway mutation, or production deployment.

Both workers use Python 3.12, a digest-pinned official Alpine 3.23 base,
`uv.lock`, and hashed requirements exports. The CAD build additionally pins
LibreDWG by version and SHA-256.

## Dependency refresh

Run each block from the worker directory with Python 3.12 and the reviewed uv
version available. The current authority is uv `0.12.0`; stop if `uv --version`
does not report that exact version:

```powershell
uv --version
uv lock --python 3.12 --upgrade
uv export --frozen --no-dev --no-emit-project --format requirements-txt --output-file requirements.lock
uv export --frozen --extra dev --no-emit-project --format requirements-txt --output-file requirements-dev.lock
uv lock --check
uv run --frozen --extra dev pytest -q
```

Review the lock diff for unexpected packages, source URLs, platform markers,
and removed hashes. The runtime export must not contain pytest. Never hand-edit
an exported hash to make a build pass.

## Base-image refresh

Resolve the official multi-platform index without pulling or running it:

```powershell
docker buildx imagetools inspect python:3.12-alpine3.23 --format '{{json .Manifest}}'
```

Record the index digest and the selected platform's Python version/source
revision in the changeset, update both Dockerfiles together, and run two clean
builds from the same source. The tag is descriptive; the digest is the build
authority.

The final images pin the Alpine `sqlite-libs` security update, and the DXF
builder pins every direct build package. Query candidate versions from the
selected Alpine 3.23 repository and update those exact Dockerfile pins as one
reviewed change. The package version and repository signature are both build
authorities; an unavailable pin must stop the build instead of resolving a
substitute.

## LibreDWG refresh

Download only the intended release artifact from the upstream LibreDWG GitHub
release, compute its SHA-256 independently, and update `LIBREDWG_VERSION` and
`LIBREDWG_SHA256` together. A checksum mismatch must stop the build before
extraction. Verify `dwg2dxf --version` in the final image and rerun the stable
CAD extraction digest test.

## Local verification

For each worker:

1. run `uv lock --check` and the frozen test suite;
2. run two `docker build --pull --no-cache` builds from the worker directory;
3. confirm Python 3.12, UID/GID 10001, and application import in the image;
4. for CAD, also confirm LibreDWG version and deterministic fixture digest;
5. generate and inspect the CI SBOM/vulnerability artifacts when that lane is
   available; do not substitute an unpinned local scanner download.

## Rollback

Rollback is source-controlled: restore the prior reviewed Dockerfile,
`pyproject.toml`, `uv.lock`, hashed exports, and exact Alpine package pins
together, rebuild locally, and repeat the same smokes. Never reuse a newly
resolved dependency graph or system-package set with an older manifest, lock,
export, package-version set, or base digest.
