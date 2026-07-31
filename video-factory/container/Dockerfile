FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ffmpeg imagemagick python3 python3-pip fonts-noto-cjk fonts-noto-color-emoji \
    ca-certificates curl tini unzip && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir edge-tts==7.2.7

WORKDIR /app
COPY container/package.json ./package.json
RUN npm install --omit=dev && npm cache clean --force
COPY container/server.mjs container/render-job.mjs ./

RUN mkdir -p /work/jobs && chown -R node:node /app /work
USER node
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.mjs"]
