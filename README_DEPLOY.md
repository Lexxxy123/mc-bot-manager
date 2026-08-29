# Run locally with Docker Compose

This repository contains a Next.js dashboard that manages Minecraft bots and a Postgres-backed database using Drizzle ORM.

What I added
- Dockerfile: builds the app and runs Drizzle migrations (npx drizzle-kit push) before starting Next.js
- docker-compose.yml: runs Postgres and the web service, wiring DATABASE_URL for you
- .dockerignore: keeps image clean

Quick start (on your machine)
1. Copy or customize environment values in docker-compose.yml. The default DATABASE_URL used by compose is:

   postgres://botuser:secret@db:5432/mcbot

   If you prefer to use your own Postgres instance, set DATABASE_URL in the web service environment to point at it.

2. Build and run:

   docker compose up --build -d

3. Inspect logs:

   docker compose logs -f web

4. Visit the web UI:

   http://localhost:3000

Important notes before starting bots
- The app requires valid Minecraft access tokens for each bot. These tokens must be added when you create a bot in the dashboard (or inserted into the database). The app validates tokens against Minecraft services at connect time.
- The container running the app must be allowed to make outbound TCP connections to Minecraft servers and any SOCKS proxies you configure.
- The OpenRouter AI integration uses the OPENROUTER_API_KEY environment variable; without it, the AI fallback heuristics still work but AI replies won't function.
- Keep tokens and secrets secure. Don't commit them to the repo.

If you want I can also:
- Add a small sample seed script to create an admin user and a demo bot record (requires you to provide or accept a placeholder token).
- Add instructions to run the app without Docker (npm install + npm run dev).
- Create a separate "worker" service if you want bots isolated from the web server process.
