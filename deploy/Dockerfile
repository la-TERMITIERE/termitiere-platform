# Image du FRONTEND (app React) servie par Caddy (HTTPS auto + reverse-proxy API).
# Build en 2 étapes : 1) compilation Vite vers la cible Supabase auto-hébergée,
#                     2) Caddy sert les fichiers statiques + proxifie l'API Supabase.
# Contexte de build attendu : la RACINE du dépôt (voir docker-compose.yml).

# ---------- Étape 1 : build de l'app ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Variables injectées au build (passées par docker-compose depuis le .env).
ARG VITE_USE_SUPABASE=true
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Vite lit .env.production.local (priorité maxi) → on l'écrit à partir des ARG.
RUN printf "VITE_USE_SUPABASE=%s\nVITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n" \
      "$VITE_USE_SUPABASE" "$VITE_SUPABASE_URL" "$VITE_SUPABASE_ANON_KEY" > .env.production.local \
    && npm run build

# ---------- Étape 2 : service web (Caddy) ----------
FROM caddy:2-alpine
COPY --from=build /app/dist /srv/app
COPY deploy/Caddyfile /etc/caddy/Caddyfile
