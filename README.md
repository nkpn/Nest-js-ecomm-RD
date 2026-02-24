# NestJS E-Comm (Pet Project)

## Architecture Vision 
This is a modular e-commerce service with Domain Driven Design Architecture (hopefully) that supports following modules:
- users
- orders
- products
- payments
- notifications
and can be scaled to new domains.

## Modules responsibility (TBD)
- Users: registration, authentification, profile.
- Orders: order creation, status, history.
- Payments: payment initiation, callbacks/webhooks handling, statuses.
- Notifications: email/SMS/push, message templates.

## Internal Layers  (TBD)
- Controller: HTTP handling, DTO validation, request/response mapping.
- Service: business logic, orchestration of domain flows.
- Repository: data access, ORM/DB isolation.


## Setup
1) Copy `.env.example` to `.env` and adjust values.
2) Start database:
```
docker compose up -d
```
3) Install dependencies:
```
npm i
```
4) Run migrations:
```
npm run migration:run
```
5) Seed data:
```
npm run seed
```
6) Start API:
```
npm run start:dev
```
Start in development mode (with file watching):
```
npm run start:dev
```

Start in production mode (after build):
```
npm run build
npm run start:prod
```

## 6. Docker / Compose Guide

### 6.1 Run Commands
Development (hot reload + bind mount):
```bash
docker compose -f compose.yml -f compose.dev.yml up --build
```

Production-like local run:
```bash
docker compose -f compose.yml up --build
```

Migrations / seed as one-off jobs:
```bash
docker compose run --rm migrate
docker compose run --rm seed
```

If your repository contains both `compose.yml` and `docker-compose.yml`, use explicit file selection for jobs:
```bash
docker compose -f compose.yml run --rm migrate
docker compose -f compose.yml run --rm seed
```

API endpoint:
```bash
http://localhost:8080
```

### 6.2 Optimization Evidence
Compare image sizes:
```bash
docker build --target dev -t e-tech:dev .
docker build --target prod -t e-tech:prod .
docker build --target prod-distroless -t e-tech:prod-distroless .
docker image ls | grep 'e-tech'
```

Inspect image layers:
```bash
docker history e-tech:dev
docker history e-tech:prod
docker history e-tech:prod-distroless
```

Short conclusion:
- `prod-distroless` is usually smaller than `dev` and often smaller/similar to `prod`.
- `prod-distroless` is safer because it has no package manager/shell and uses non-root base (`nonroot`).

### 6.3 Non-root Verification
For `prod` image:
```bash
docker run --rm --entrypoint id e-tech:prod -u
```
Expected: non-zero/non-root UID (not `0`).

For `prod-distroless` image:
```bash
docker run --rm --entrypoint /nodejs/bin/node e-tech:prod-distroless -e "console.log(process.getuid())"
```
Expected: `65532` (`nonroot` user in distroless image).

Why this guarantees non-root in distroless:
- base image is `gcr.io/distroless/nodejs22-debian12:nonroot`;
- runtime has no shell and runs as non-root by design.


## Modules
- Users (`/users`)
- Orders (`/orders`)

### Relationships (Many-to-One)
- `Order` → `User` (many to one )
- `OrderItem` → `Order` (many to one)

### User
User module provides endpoints for creating a user and get all users.
Routes:
- GET /users
- POST /users

