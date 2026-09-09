#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker non trovato. Installa Docker Engine e Docker Compose sul server Linux.' >&2
  exit 1
fi
docker compose version >/dev/null
if [ ! -f .env ]; then
  umask 077
  cp .env.example .env
  echo 'Configurazione .env creata. Accesso solo locale per impostazione predefinita.'
fi
docker compose up -d --build
echo 'Jenny Web avviato. Apri http://127.0.0.1:3000 sul server.'
echo 'Accesso con username/password. Per creare il primo amministratore segui LOGIN-WEB.md (Jenny deve essere fermo).'
echo 'Per accedere dalla LAN, imposta JENNY_BIND=0.0.0.0 in .env e riesegui questo script.'
