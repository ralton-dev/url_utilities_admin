FROM node:25-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:25-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

RUN addgroup -g 10001 -S app && adduser -u 10001 -S app -G app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=10001:10001 /app/dist ./dist

RUN chown -R 10001:10001 /app

USER 10001

EXPOSE 4000

CMD ["node", "dist/server.js"]
