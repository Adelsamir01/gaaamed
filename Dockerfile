FROM node:24.15.0-bookworm-slim

ENV NODE_ENV=production \
    PORT=8787 \
    DEDOS_DATA_DIR=/data \
    DEDOS_DB_PATH=/data/dedos.sqlite \
    DEDOS_BACKUP_DIR=/backups

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --chown=node:node server ./server
COPY --chown=node:node src/data/trivia.ts ./src/data/trivia.ts
COPY --chown=node:node src/games/match3/engine.js ./src/games/match3/engine.js
COPY --chown=node:node tools/backup-server.mjs tools/verify-backup.mjs ./tools/
COPY --chown=node:node dedos-release.apk ./dedos-release.apk

RUN mkdir -p /data /backups && chown node:node /data /backups

USER node
EXPOSE 8787
VOLUME ["/data", "/backups"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server/server.js"]
