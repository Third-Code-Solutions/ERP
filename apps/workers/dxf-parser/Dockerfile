FROM python:3.12-alpine3.23@sha256:31a768b01976652c222e318fe5bd6e7c252f056cbf489c88fa256f1bf0af58e3 AS libredwg-builder

ARG LIBREDWG_VERSION=0.13.4
ARG LIBREDWG_SHA256=7e153ea4dac4cbf3dc9c50b9ef7a5604e09cdd4c5520bcf8017877bbe1422cd5

# Build the pinned upstream release with exact Alpine 3.23 build packages.
RUN apk add --no-cache \
    autoconf=2.72-r1 \
    automake=1.18.1-r0 \
    build-base=0.5-r3 \
    ca-certificates=20260611-r0 \
    curl=8.20.0-r0 \
    libtool=2.5.4-r2 \
    pkgconf=2.5.1-r0 \
    xz=5.8.3-r0 \
    && curl --fail --silent --show-error --location \
      "https://github.com/LibreDWG/libredwg/releases/download/${LIBREDWG_VERSION}/libredwg-${LIBREDWG_VERSION}.tar.xz" \
      --output /tmp/libredwg.tar.xz \
    && echo "${LIBREDWG_SHA256}  /tmp/libredwg.tar.xz" | sha256sum -c -s \
    && mkdir -p /tmp/libredwg \
    && tar -xJf /tmp/libredwg.tar.xz --strip-components=1 -C /tmp/libredwg \
    && cd /tmp/libredwg \
    && ./configure --prefix=/usr/local --disable-bindings --disable-docs --disable-shared --enable-release \
    && make -j"$(nproc)" \
    && make install \
    && test -x /usr/local/bin/dwg2dxf \
    && /usr/local/bin/dwg2dxf --version \
    && rm -rf /tmp/libredwg /tmp/libredwg.tar.xz

FROM ghcr.io/astral-sh/uv:0.12.0@sha256:606e70c71c852d03f611b1e56a195d08648507018a7057fab82c4974c4eae105 AS uv

FROM python:3.12-alpine3.23@sha256:31a768b01976652c222e318fe5bd6e7c252f056cbf489c88fa256f1bf0af58e3 AS dependencies

WORKDIR /app

COPY --from=uv /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock requirements.lock ./
RUN cp requirements.lock /tmp/requirements.lock \
    && uv lock --check \
    && uv export --frozen --no-dev --no-emit-project --format requirements-txt --output-file requirements.lock \
    && cmp --silent /tmp/requirements.lock requirements.lock \
    && pip install --no-cache-dir --require-hashes --prefix=/install -r requirements.lock

FROM python:3.12-alpine3.23@sha256:31a768b01976652c222e318fe5bd6e7c252f056cbf489c88fa256f1bf0af58e3

WORKDIR /app

# Keep only the converter from the native build stage in the runtime image.
COPY --from=libredwg-builder /usr/local/bin/dwg2dxf /usr/local/bin/dwg2dxf
COPY --from=dependencies /install /usr/local

RUN apk add --no-cache --upgrade sqlite-libs=3.53.4-r0

# Verify dwg2dxf is on PATH at build time so Railway logs surface install issues early.
RUN which dwg2dxf && dwg2dxf --version

COPY src/ src/
RUN addgroup -g 10001 worker \
    && adduser -D -H -u 10001 -G worker -s /sbin/nologin worker

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV HOME=/tmp
ENV XDG_CACHE_HOME=/tmp/.cache
ENV PORT=8000

USER 10001:10001

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
