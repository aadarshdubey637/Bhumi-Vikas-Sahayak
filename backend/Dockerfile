# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv/app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini pyproject.toml ./
COPY app ./app
COPY scripts ./scripts
COPY docker-entrypoint.sh ./
# Rule data (JSONL + page text + amendment register) is baked in so a managed host (Render) can self-load the database with
# INGEST_ON_START=1. The PDFs and data/processed/ are excluded by .dockerignore. docker-compose mounts ./data over this.
COPY data ./data
RUN useradd --system --uid 10001 --home /srv/app appuser && chown -R appuser /srv/app && chmod +x docker-entrypoint.sh
USER appuser

# PORT is injected by Render (and most PaaS); 8000 otherwise. WEB_CONCURRENCY defaults to 1 because the rate limiter and the
# in-memory search index are per process.
ENV PORT=8000 WEB_CONCURRENCY=1
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/api/v1/health' % os.environ.get('PORT','8000'), timeout=2).status == 200 else 1)"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["sh", "-c", "exec uvicorn app.main:app_factory --factory --host 0.0.0.0 --port \"$PORT\" --workers \"$WEB_CONCURRENCY\" --proxy-headers"]
