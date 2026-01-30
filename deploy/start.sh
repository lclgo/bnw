#!/bin/bash

# Set default values if environment variables are not provided
PORT=${PORT:-37801}
IPADDR=${IPADDR:-8.8.8.8}
AUTH_USER=${AUTH_USER:-admin}
AUTH_PASS=${AUTH_PASS:-hahe1234}

echo "Starting with PORT=$PORT, IPADDR=$IPADDR, USER=$AUTH_USER"

# Replace placeholders in nginx config
sed -i "s/PORT/$PORT/g" /etc/nginx/http.d/wiki.conf
sed -i "s/IPADDR/$IPADDR/g" /etc/nginx/http.d/wiki.conf

# Generate htpasswd file for basic auth
htpasswd -nb "$AUTH_USER" "$AUTH_PASS" > /etc/nginx/http.d/.htpasswd
echo "Basic auth configured for user: $AUTH_USER"

# Start nginx
nginx

# Start vite preview server (provides both static files and API)
cd /app && npm run preview
