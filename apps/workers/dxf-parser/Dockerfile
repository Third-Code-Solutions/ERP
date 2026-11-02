FROM python:3.12-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1 AS libredwg-builder

ARG LIBREDWG_VERSION=0.13.4

# Debian does not ship libredwg-tools. Build the pinned upstream release so
# the worker image is reproducible and does not depend on an unavailable apt
# package name.
RUN apt-get update && apt-get install -y --no-install-recommends \
    autoconf \
    automake \
    build-essential \
    ca-certificates \
    curl \
    libtool \
    pkg-config \
    xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && curl --fail --silent --show-error --location \
      "https://github.com/LibreDWG/libredwg/releases/download/${LIBREDWG_VERSION}/libredwg-${LIBREDWG_VERSION}.tar.xz" \
      --output /tmp/libredwg.tar.xz \
    && echo "7e153ea4dac4cbf3dc9c50b9ef7a5604e09cdd4c5520bcf8017877bbe1422cd5  /tmp/libredwg.tar.xz" | sha256sum --check --strict \
    && mkdir -p /tmp/libredwg \
    && tar -xJf /tmp/libredwg.tar.xz --strip-components=1 -C /tmp/libredwg \
    && cd /tmp/libredwg \
    && ./configure --prefix=/usr/local --disable-bindings --disable-docs --disable-shared --enable-release \
    && make -j2 \
    && make install \
    && test -x /usr/local/bin/dwg2dxf \
    && /usr/local/bin/dwg2dxf --version \
    && rm -rf /tmp/libredwg /tmp/libredwg.tar.xz

FROM python:3.12-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

WORKDIR /app

# LibreDWG is built in the first stage because Debian does not provide a
# libredwg-tools package. Keep only the converter in the runtime image.
COPY --from=libredwg-builder /usr/local/bin/dwg2dxf /usr/local/bin/dwg2dxf

# Verify dwg2dxf is on PATH at build time so Railway logs surface install issues early.
RUN which dwg2dxf && dwg2dxf --version

COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock

COPY src/ src/

RUN useradd --uid 10001 --create-home worker

# Reviewed runtime minimization (ADR-040; changeset
# docs/changesets/2026-10-12-abi-ops-independent-readiness.md): drop the
# superseded userland packages that the CI trivy gate flags and whose code is
# unreachable from this worker (ncurses, systemd/udev, acl, util-linux,
# perl-base and the packages that only serve them). The script keeps an honest
# /var/lib/dpkg/status so scanners still see every remaining package, and
# asserts /bin/sh, python3 and dwg2dxf still work afterwards.
# It must remain the LAST step running as root: no userland tools (rm, tar,
# dpkg, perl) survive it, so append future RUN steps above, not below.
COPY minimize-runtime.sh /usr/local/share/minimize-runtime.sh
RUN sh /usr/local/share/minimize-runtime.sh \
    && dwg2dxf --version \
    && python3 -c "import uvicorn, fastapi"
USER 10001

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
