FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js, Nginx, PostgreSQL, and Supervisor
RUN apt-get update && apt-get install -y \
    curl \
    nginx \
    postgresql \
    postgresql-contrib \
    supervisor \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend and install dependencies
COPY backend/ ./backend/
RUN cd backend && npm install

# Copy frontend to Nginx web root
COPY frontend/ /var/www/html/

# Configure Nginx reverse proxy for /items
RUN echo "server { listen 80; root /var/www/html; index index.html; location / { try_files \$uri \$uri/ =404; } location ~ ^/(items|health) { proxy_pass http://localhost:3000; proxy_http_version 1.1; proxy_set_header Host \$host; } }" > /etc/nginx/sites-available/default

# Initialize PostgreSQL, create user/db, and allow password authentication locally
USER postgres
RUN PG_VER=$(ls /usr/lib/postgresql/ | head -n 1) && \
    [ ! -d "/var/lib/postgresql/$PG_VER/main" ] && pg_createcluster $PG_VER main || true; \
    /usr/bin/pg_ctlcluster $PG_VER main start && \
    psql --command "CREATE USER admin WITH SUPERUSER PASSWORD 'password123';" || true && \
    createdb -O admin crud_db || true && \
    echo "host all all 127.0.0.1/32 md5" >> /etc/postgresql/$PG_VER/main/pg_hba.conf && \
    echo "listen_addresses='*'" >> /etc/postgresql/$PG_VER/main/postgresql.conf && \
    /usr/bin/pg_ctlcluster $PG_VER main stop

USER root

# Configure Supervisor with proper socket server and programs
RUN PG_VER=$(ls /usr/lib/postgresql/ | head -n 1) && \
    echo '[unix_http_server]' > /etc/supervisor/conf.d/supervisord.conf && \
    echo 'file=/var/run/supervisor.sock' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[supervisord]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'nodaemon=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'logfile=/var/log/supervisord.log' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[supervisorctl]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'serverurl=unix:///var/run/supervisor.sock' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[program:postgres]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo "command=/usr/lib/postgresql/$PG_VER/bin/postgres -D /var/lib/postgresql/$PG_VER/main -c config_file=/etc/postgresql/$PG_VER/main/postgresql.conf" >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'user=postgres' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[program:backend]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'command=node /app/backend/server.js' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo '[program:nginx]' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'command=nginx -g "daemon off;"' >> /etc/supervisor/conf.d/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/supervisord.conf

EXPOSE 80

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
