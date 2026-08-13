FROM python:3.11-slim-bookworm AS libredwg-builder

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
    && mkdir -p /tmp/libredwg \
    && tar -xJf /tmp/libredwg.tar.xz --strip-components=1 -C /tmp/libredwg \
    && cd /tmp/libredwg \
    && ./configure --prefix=/usr/local --disable-bindings --disable-docs --disable-shared --enable-release \
    && make -j"$(nproc)" \
    && make install \
    && test -x /usr/local/bin/dwg2dxf \
    && /usr/local/bin/dwg2dxf --version \
    && rm -rf /tmp/libredwg /tmp/libredwg.tar.xz

FROM python:3.11-slim-bookworm

WORKDIR /app

# LibreDWG is built in the first stage because Debian does not provide a
# libredwg-tools package. Keep only the converter in the runtime image.
COPY --from=libredwg-builder /usr/local/bin/dwg2dxf /usr/local/bin/dwg2dxf

# Verify dwg2dxf is on PATH at build time so Railway logs surface install issues early.
RUN which dwg2dxf && dwg2dxf --version

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY src/ src/

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
