FROM python:3.12-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

WORKDIR /app

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
# asserts /bin/sh and the python import path afterwards.
# It must remain the LAST step running as root: no userland tools (rm, tar,
# dpkg, perl) survive it, so append future RUN steps above, not below.
COPY minimize-runtime.sh /usr/local/share/minimize-runtime.sh
RUN sh /usr/local/share/minimize-runtime.sh \
    && python3 -c "import uvicorn, fastapi"
USER 10001

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
