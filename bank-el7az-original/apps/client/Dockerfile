FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/client apps/client
RUN npm run build -w @bank-el7az/shared && npm run build -w @bank-el7az/client

FROM nginx:1.27-alpine
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
