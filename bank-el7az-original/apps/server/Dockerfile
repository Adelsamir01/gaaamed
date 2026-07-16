FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w @bank-el7az/shared && npm run build -w @bank-el7az/server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
RUN npm ci --omit=dev

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/dist apps/server/dist

EXPOSE 3001
CMD ["node", "apps/server/dist/index.js"]
