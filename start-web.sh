#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker non trovato. Installa Docker Engine e Docker Compose sul server Linux.' >&2
  exit 1
fi
docker compose version >/dev/null
if [ ! -f .env ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo 'Serve openssl per generare il token iniziale, oppure prepara .env manualmente.' >&2
    exit 1
  fi
  umask 077
  jenny_token=$(openssl rand -hex 24)
  sed "s/^JENNY_TOKEN=$/JENNY_TOKEN=$jenny_token/" .env.example > .env
  echo 'Configurazione .env creata. Accesso solo locale per impostazione predefinita.'
fi
docker compose up -d --build
echo 'Jenny Web avviato. Apri http://127.0.0.1:3000 sul server.'
echo 'Il token per la schermata Connessione si trova nel campo JENNY_TOKEN di .env.'
echo 'Per accedere dalla LAN, imposta JENNY_BIND=0.0.0.0 in .env e riesegui questo script.'
