# Stage 1: build the frontend
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend serving the built frontend (Python 3.9 like CI and the venv)
FROM python:3.9-slim
WORKDIR /app

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# SQLite lives in /app/data, mounted as a volume
RUN useradd --system --uid 10001 tt && mkdir -p /app/data && chown tt /app/data
USER tt
ENV PYTHONPATH=/app \
    DATABASE_URL=sqlite:////app/data/turnier.db
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --start-interval=2s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/server/info', timeout=3)"

# One process on purpose: the WebSocket hub is in memory
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
