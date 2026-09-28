# Devops-Container

A multi-container CRUD web app: an Nginx frontend, a Node.js + Express API and a PostgreSQL database, wired together with Docker Compose.

| Service    | Image            | Port (host → container) |
|------------|------------------|-------------------------|
| `frontend` | `nginx:alpine`   | 8080 → 80               |
| `backend`  | `node:18-alpine` | 3000 → 3000             |
| `database` | `postgres:15`    | 5433 → 5432             |

Nginx serves the landing page and proxies `/items` and `/health` to the backend over the `my_custom_net` network. Data lives on the `my_db_data` volume.

## Run

```bash
docker network create my_custom_net
docker volume create my_db_data
docker compose up -d --build
```

Open http://localhost:8080.

An all-in-one image (Nginx, Node.js, PostgreSQL under Supervisor) is also available via the root `Dockerfile`:

```bash
docker build -t devops-allinone . && docker run -p 80:80 devops-allinone
```

## API

| Method | Path         | Description                    |
|--------|--------------|--------------------------------|
| GET    | `/items`     | List all items                 |
| GET    | `/items/:id` | Get one item                   |
| POST   | `/items`     | Create `{ name, description }` |
| PUT    | `/items/:id` | Update `{ name, description }` |
| DELETE | `/items/:id` | Delete an item                 |
| GET    | `/health`    | Backend & database status      |
