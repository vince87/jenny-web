FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data WORKSPACES_DIR=/workspaces
RUN apt-get update && apt-get install -y --no-install-recommends git gh && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node services ./services
COPY --chown=node:node web ./web
COPY LICENSE NOTICE ./
RUN mkdir -p /data /workspaces && chown node:node /data /workspaces
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "web/server.cjs"]
