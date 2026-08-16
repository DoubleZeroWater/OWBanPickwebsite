# syntax=docker/dockerfile:1

FROM node:22-bookworm AS frontend-build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json vite.config.ts ./
COPY frontend ./frontend
COPY backend ./backend
COPY scripts ./scripts
COPY static ./static
COPY .openai ./.openai

RUN npm ci && npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY backend ./backend
COPY scripts ./scripts
COPY static ./static
COPY --from=frontend-build /app/dist ./dist

EXPOSE 5174

CMD ["gunicorn", "--bind", "0.0.0.0:5174", "backend.app:app"]
