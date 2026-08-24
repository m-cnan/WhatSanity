FROM node:22-bookworm-slim

# better-sqlite3 needs build tools to compile its native binding
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/index.js"]
