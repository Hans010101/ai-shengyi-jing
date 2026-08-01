FROM node:22-bookworm-slim AS node-deps

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1

WORKDIR /app
COPY --chown=node:node container/package.json ./package.json
RUN npm install --omit=dev \
    && rm -rf node_modules/onnxruntime-node node_modules/.cache \
    && npm cache clean --force

FROM node:22-bookworm-slim AS chromium-package
RUN apt-get update \
    && cd /tmp \
    && apt-get download chromium \
    && mkdir -p /chromium-root /chromium-bin \
    && dpkg-deb -x chromium_*.deb /chromium-root \
    && split -b 100m /chromium-root/usr/lib/chromium/chromium /chromium-bin/chromium.part. \
    && rm /chromium-root/usr/lib/chromium/chromium \
    && rm -rf /var/lib/apt/lists/* /tmp/chromium_*.deb

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_EXECUTABLE_PATH=/usr/lib/chromium/chromium \
    HYPERFRAMES_BROWSER_PATH=/usr/lib/chromium/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PYTHONUNBUFFERED=1

# Keep the runtime in several registry-friendly layers. Cloudflare's container
# registry can stall on a single compressed layer containing Chromium, FFmpeg,
# Python and the CJK fonts together, while each layer below remains reusable.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates tini libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libatspi2.0-0 libcairo2 libcups2 libdav1d6 libdbus-1-3 \
    libdouble-conversion3 libexpat1 libflac12 libfontconfig1 libfreetype6 \
    libgbm1 libglib2.0-0 libharfbuzz-subset0 libharfbuzz0b \
    libjpeg62-turbo liblcms2-2 libminizip1 libnspr4 libnss3 \
    && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenh264-7 libopenjp2-7 libopus0 libpango-1.0-0 libpulse0 \
    libudev1 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxkbcommon0 libxnvctrl0 libxrandr2 libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends \
    libdrm-amdgpu1 libdrm-intel1 libdrm-nouveau2 libdrm-radeon1 \
    libedit2 libelf1 libfontenc1 libgl1 libgl1-mesa-dri libglapi-mesa \
    libglvnd0 libglx-mesa0 libglx0 libice6 libllvm15 libpciaccess0 \
    libsensors-config libsensors5 libsm6 libxaw7 libxcb-dri2-0 \
    libxcb-dri3-0 libxcb-glx0 libxcb-present0 libxcb-randr0 \
    libxcb-shape0 libxcb-sync1 libxcb-xfixes0 libxft2 libxkbfile1 \
    libxmu6 libxmuu1 libxpm4 libxshmfence1 libxt6 libxtst6 libxv1 \
    libxxf86dga1 libxxf86vm1 libz3-4 x11-common x11-utils xdg-utils \
    && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium-common && rm -rf /var/lib/apt/lists/*
COPY --from=chromium-package /chromium-bin/chromium.part.aa /opt/chromium-parts/chromium.part.aa
COPY --from=chromium-package /chromium-bin/chromium.part.ab /opt/chromium-parts/chromium.part.ab
COPY --from=chromium-package /chromium-bin/chromium.part.ac /opt/chromium-parts/chromium.part.ac
COPY --from=chromium-package /chromium-root/ /
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg imagemagick && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk fonts-noto-color-emoji && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir edge-tts==7.2.7

WORKDIR /app
COPY --chown=node:node container/package.json ./package.json
COPY --from=node-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node container/server.mjs container/render-job.mjs container/entrypoint.sh ./

RUN mkdir -p /work/jobs \
    && chown -R node:node /work \
    && chown node:node /usr/lib/chromium
USER node
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--", "sh", "/app/entrypoint.sh"]
CMD ["node", "server.mjs"]
