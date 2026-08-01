FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PYTHONUNBUFFERED=1

# Keep the runtime in several registry-friendly layers. Cloudflare's container
# registry can stall on a single compressed layer containing Chromium, FFmpeg,
# Python and the CJK fonts together, while each layer below remains reusable.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ca-certificates tini && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg imagemagick && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk fonts-noto-color-emoji && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir edge-tts==7.2.7

WORKDIR /app
COPY --chown=node:node container/package.json ./package.json
# HyperFrames' transcription dependency is not used by this render-only image;
# ASR quality checks run in Workers AI after the audio has been uploaded to R2.
RUN npm install --omit=dev \
    && rm -rf node_modules/onnxruntime-node node_modules/.cache \
    && npm cache clean --force
COPY --chown=node:node container/server.mjs container/render-job.mjs ./

RUN mkdir -p /work/jobs && chown -R node:node /work
USER node
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.mjs"]
