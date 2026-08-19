#!/usr/bin/env bash
# Выкатка новой версии: /srv/saletracker/deploy/release.sh
set -euo pipefail

cd /srv/saletracker

git fetch --prune origin
git checkout main
git reset --hard origin/main

npm ci
npm run db:migrate
npm run build

sudo systemctl restart saletracker

# Ждём, пока сервис ответит, иначе выкатка считается неудачной.
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health > /dev/null; then
    echo "Релиз выкачен, сервис отвечает."
    exit 0
  fi
  sleep 2
done

echo "Сервис не ответил после перезапуска." >&2
exit 1
