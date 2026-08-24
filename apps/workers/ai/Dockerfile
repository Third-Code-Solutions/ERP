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

RUN apk add --no-cache --upgrade sqlite-libs=3.53.4-r0

COPY --from=dependencies /install /usr/local

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
