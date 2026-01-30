# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
RUN apk add --no-cache \
    nginx \
    apache2-utils \
    tzdata \
    bash

WORKDIR /app
RUN mkdir -p wiki-data

# Copy all built files and dependencies for vite preview
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/vite*.ts ./
COPY --from=builder /app/tsconfig*.json ./
COPY deploy/nginx.conf /etc/nginx/http.d/wiki.conf
COPY deploy/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 37801
CMD ["/bin/bash", "/start.sh"]
