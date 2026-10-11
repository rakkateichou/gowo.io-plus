FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs store.mjs ./
RUN mkdir /data && chown node:node /data

ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/data/relay.sqlite
EXPOSE 3000

USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
