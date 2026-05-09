FROM python:3.11-slim

WORKDIR /app

# Install build tools for psycopg C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY src/ src/

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
