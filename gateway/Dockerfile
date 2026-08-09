FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY tls.conf /etc/nginx/tls.conf
COPY cloudflare-realip.conf /etc/nginx/cloudflare-realip.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
EXPOSE 80 443
