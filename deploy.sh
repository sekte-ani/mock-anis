#!/usr/bin/env bash
set -euo pipefail

APP_NAME="mock-anis"
COMPOSE_FILE="docker-compose.yml"

if [ ! -f ".env" ]; then
  echo "[ERROR] File .env tidak ditemukan."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker belum terinstall."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD=(docker-compose)
else
  echo "[ERROR] docker compose / docker-compose tidak tersedia."
  exit 1
fi

echo "[INFO] Deploying ${APP_NAME}..."
"${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" down
"${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" up -d --build

echo "[INFO] Deploy selesai. Cek status container:"
"${DOCKER_COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" ps

echo "[INFO] Lihat logs:"
echo "  ${DOCKER_COMPOSE_CMD[*]} -f ${COMPOSE_FILE} logs -f ${APP_NAME}"
