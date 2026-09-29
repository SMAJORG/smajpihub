FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build:solohost
RUN find dist -type f -name '*.map' -delete

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY solohost/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY solohost/web/entrypoint.sh /usr/local/bin/smaj-solohost-entrypoint
COPY --from=builder /app/dist /usr/share/nginx/html
USER root
RUN chmod 0555 /usr/local/bin/smaj-solohost-entrypoint \
    && chown -R nginx:nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/smaj-solohost-entrypoint"]
