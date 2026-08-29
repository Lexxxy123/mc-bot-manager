# Dockerfile for running the Next.js + bot manager app in production
# - Installs all dependencies (including devDeps, needed for drizzle-kit migrations)
# - Builds Next.js and runs drizzle-kit push before starting next start
FROM node:20-alpine

# Install OS deps needed for some native modules (openssl, build tools)
RUN apk add --no-cache python3 make g++ bash

WORKDIR /app

COPY package.json package-lock.json* ./
# Install all deps so drizzle-kit (devDep) is available for migrations
RUN npm ci --no-optional --silent

COPY . .

# Build the Next app
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run DB migrations then start Next.js
CMD ["/bin/sh", "-lc", "npx drizzle-kit push && next start -p $PORT"]
