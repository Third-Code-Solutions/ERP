FROM python:3.11-slim

WORKDIR /app

# System deps:
#   gcc, libpq-dev   — psycopg C extensions
#   libredwg-tools   — provides /usr/bin/dwg2dxf for DWG→DXF conversion
#                      (open-source, AGPL-licensed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libredwg-tools \
    && rm -rf /var/lib/apt/lists/*

# Verify dwg2dxf is on PATH at build time so Railway logs surface install issues early
RUN which dwg2dxf || (echo "dwg2dxf not found in PATH" && exit 1)

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY src/ src/

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
