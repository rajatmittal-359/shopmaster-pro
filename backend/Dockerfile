# The API in a box (20 Sep 2026 - production moves to one AWS Lightsail
# instance; see OPS "THE TARGET ARCHITECTURE"). Built by GitHub Actions, never
# on the server. Two stages so the image carries production dependencies only.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# curl for the HEALTHCHECK below; tini so signals reach node and the container stops in a second, not ten.
RUN apk add --no-cache curl tini
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Never root inside the container - the base image ships a `node` user.
USER node
EXPOSE 5000
# /api/health answers 200 only when MongoDB pings back (see app.js), so a
# container that lost its database reads unhealthy, and compose restarts it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD curl -fsS http://localhost:5000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
