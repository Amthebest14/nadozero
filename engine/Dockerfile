# Runs the service the same way it runs locally — via tsx, no separate build
# step. Simple and consistent with how this project already works; if this
# service ever needs a "real" compiled build, that's a deliberate later step,
# not something to bolt on now for its own sake.
FROM node:22-slim

WORKDIR /app

# better-sqlite3 needs to compile a native module against this image's node/libc
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY tsconfig.json ./

EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
