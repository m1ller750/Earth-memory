FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATA_DIR=/data
COPY --from=build /app ./
RUN useradd --system --uid 1001 earth && mkdir -p /data && chown earth /data
USER earth
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]
