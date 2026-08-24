FROM node:22-bookworm-slim

# better-sqlite3 needs build tools + git/openssh for some deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
    && git config --global url."https://github.com/".insteadOf "git@github.com:"

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/index.js"]
