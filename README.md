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
This also starts RabbitMQ for asynchronous order processing.
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
Required env vars (no weak fallbacks in compose):
```bash
export DB_PASS=replace_with_strong_db_password
export JWT_SECRET=replace_with_long_random_jwt_secret
```

Production-like local run:
```bash
export PORT=8080
export RABBITMQ_PORT=5673
export RABBITMQ_MGMT_PORT=15673
docker compose -f compose.yml up --build -d
```

Development (hot reload + bind mount):
```bash
docker compose -f compose.yml -f compose.dev.yml up --build -d
```

Migrations / seed as one-off jobs:
```bash
docker compose -f compose.yml run --rm migrate
docker compose -f compose.yml run --rm seed
```

API endpoint:
```bash
http://localhost:${PORT:-8080}
```

RabbitMQ management UI:
```bash
http://localhost:${RABBITMQ_MGMT_PORT:-15673}
```

Fail-fast proof for required secrets:
```bash
docker compose -f compose.yml config
```
```text
error while interpolating services.api.environment.JWT_SECRET:
required variable JWT_SECRET is missing a value: JWT_SECRET is required
```

### 6.2 Optimization Evidence
Compare image sizes:
```bash
docker build --target dev -t rd-hw10-fix:dev .
docker build --target prod -t rd-hw10-fix:prod .
docker build --target prod-distroless -t rd-hw10-fix:prod-distroless .
docker image ls --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' | (head -n 1 && rg '^rd-hw10-fix\s')
```

Output:
```text
REPOSITORY                 TAG                    SIZE
rd-hw10-fix                prod-distroless        421MB
rd-hw10-fix                prod                   555MB
rd-hw10-fix                dev                    769MB
```

Inspect image layers:
```bash
docker history rd-hw10-fix:dev --format '{{.Size}}\t{{.CreatedBy}}' | head -n 8
docker history rd-hw10-fix:prod --format '{{.Size}}\t{{.CreatedBy}}' | head -n 8
docker history rd-hw10-fix:prod-distroless --format '{{.Size}}\t{{.CreatedBy}}' | head -n 8
```

Output snippets:
```text
dev:
0B    CMD ["npm" "run" "start:dev"]
0B    ENV NODE_ENV=development
375MB RUN /bin/sh -c npm ci # buildkit
524kB COPY package.json package-lock.json ./ # buildkit
```
```text
prod:
0B    CMD ["node" "dist/src/main.js"]
0B    EXPOSE map[3000/tcp:{}]
0B    USER node
1.58MB COPY /app/dist ./dist # buildkit
185MB COPY /app/node_modules ./node_modules # buildkit
```
```text
prod-distroless:
0B    CMD ["dist/src/main.js"]
0B    EXPOSE map[3000/tcp:{}]
1.58MB COPY /app/dist ./dist # buildkit
185MB COPY /app/node_modules ./node_modules # buildkit
121MB bazel build @nodejs22_arm64//:data
```

Short conclusion:
- `prod-distroless` is 348MB smaller than `dev` and 134MB smaller than `prod`.
- `prod-distroless` is safer because it has no package manager/shell and uses non-root base (`nonroot`).

### 6.3 Non-root Verification
For `prod` image:
```bash
docker run --rm --entrypoint id rd-hw10-fix:prod -u
```
```text
1000
```

For `prod-distroless` image:
```bash
docker run --rm --entrypoint /nodejs/bin/node rd-hw10-fix:prod-distroless -e "console.log(process.getuid())"
```
```text
65532
```

Why this guarantees non-root in distroless:
- base image is `gcr.io/distroless/nodejs22-debian12:nonroot`;
- runtime has no shell and runs as non-root by design.

### 6.4 Docker Scout Security Scan
Build image for scanning:
```bash
docker build --target prod-distroless -t e-tech:prod-distroless .
```

Quick security overview (total CVE counters and detected base image):
```bash
docker scout quickview local://e-tech:prod-distroless
```

Fail check when `CRITICAL`/`HIGH` vulnerabilities are present:
```bash
docker scout cves --only-severity critical,high --exit-code local://e-tech:prod-distroless
```

Show only vulnerabilities inherited from base image:
```bash
docker scout cves --only-base local://e-tech:prod-distroless
```

Get remediation suggestions for base image updates:
```bash
docker scout recommendations local://e-tech:prod-distroless
```

Evaluate Docker Scout policies and fail on policy violations:
```bash
docker scout policy --exit-code local://e-tech:prod-distroless
```

## Modules
- Users (`/users`)
- Orders (`/orders`)

## RabbitMQ Orders Queue Topology

`POST /orders` now works as a producer flow:
- API writes the order to PostgreSQL first.
- Initial order status is forced to `PENDING`.
- After the transaction commits, API publishes a message to `orders.process`.

Topology for this step:
- exchange: default exchange (`""`) for direct queue publish via `sendToQueue`
- queue: `orders.process` (main worker queue)
- queue: `orders.retry.process` (retry delay queue with DLX routing back to `orders.process`)
- queue: `orders.dlq` (terminal dead-letter queue)
- durability: all queues are `durable: true`

Routing keys and message flow:
- `orders.process`: initial order processing message from API producer.
- `orders.retry.process`: transient failure retry publish (`attempt + 1`) with per-message TTL (`expiration`).
- dead-letter routing key from `orders.retry.process` -> `orders.process`.
- `orders.dlq`: permanent failures and malformed payloads.

Current message shape:
```json
{
  "messageId": "uuid",
  "orderId": "uuid",
  "createdAt": "ISO date",
  "attempt": 0,
  "correlationId": "uuid",
  "producer": "orders-api",
  "eventName": "order.created"
}
```

Why it is manual now:
- it keeps the first producer step simple;
- topology is explicit in application startup;
- on the next steps this can evolve into exchange-based routing and transactional outbox.

### Worker / Consumer Flow

Worker is implemented as a dedicated NestJS module:
- `src/orders-worker/orders-worker.module.ts`
- `src/orders-worker/orders-worker.service.ts`

Current processing workflow:
1. Worker receives message from `orders.process`.
2. Starts DB transaction in `OrdersService.processOrderMessage`.
3. Updates `orders.status = PROCESSED`.
4. Sets `orders.processed_at`.
5. Commits transaction.
6. Only after commit, worker sends `ack`.

Retry and failure behavior:
- manual `ack` mode (`noAck: false`);
- approach: **Variant A (republish + ack)**;
- max attempts: `ORDERS_MAX_ATTEMPTS` (default `3`);
- delay: exponential backoff from `ORDERS_RETRY_BASE_DELAY_MS` (default `1000`) with cap `ORDERS_RETRY_MAX_DELAY_MS` (default `30000`);
- on failure before limit: republish to `orders.retry.process` with `attempt + 1`, then `ack` original message;
- after limit: publish to `orders.dlq`, then `ack` original message.

How to verify topology in RabbitMQ Management UI:
1. Open `http://localhost:15673` and login with `guest/guest`.
2. Go to **Queues and Streams**.
3. Verify queues exist: `orders.process`, `orders.retry.process`, `orders.dlq`.
4. Open `orders.retry.process` and check arguments:
   - `x-dead-letter-exchange = ""`
   - `x-dead-letter-routing-key = orders.process`
5. Trigger processing failures and observe:
   - messages appear in `orders.retry.process` during delay window;
   - after retry limit, messages accumulate in `orders.dlq`.

### Idempotency (at-least-once safe)

Because RabbitMQ delivery is at-least-once, worker logic is protected by DB idempotency:
- table: `processed_messages`
- columns:
  - `message_id` (primary key / unique)
  - `processed_at`
  - `order_id`
  - `handler` (optional)

Algorithm used in `OrdersService.processOrderMessage`:
1. Start DB transaction.
2. Try `INSERT INTO processed_messages(message_id, order_id, handler, ...)`.
3. If unique violation (`message_id` already exists):
   - treat as duplicate delivery,
   - return without business reprocessing,
   - worker `ack` is sent by caller.
4. If insert succeeds:
   - execute business logic (`orders.status = PROCESSED`, `processed_at`),
   - commit transaction,
   - worker sends `ack`.

Why it is safe for parallel workers:
- unique constraint on `message_id` guarantees only one worker can commit the first insert;
- all other concurrent workers receive unique violation and exit without duplicate side effects.

### Worker Logging

Worker logs always include:
- `messageId`
- `orderId`
- `attempt`
- `result` (`success` / `retry` / `dlq`)
- short `reason` (for failures/retries)

Example log line:
```text
result=retry messageId=... orderId=... attempt=1 reason=Order not found; nextAttempt=2; delayMs=2000
```

## Realtime Orders Status

Project now includes a Socket.IO gateway for realtime order status updates.

Connection endpoint:
```bash
ws://localhost:3000/realtime
```

Authentication:
- client must pass JWT token in `auth.token`
- `Authorization: Bearer <token>` in handshake also works
- `?token=<jwt>` query param also works

Subscription flow:
1. Client connects to namespace `/realtime`
2. Client sends `subscribeOrder` with payload `{ "orderId": "<order-id>" }`
3. Server checks JWT and verifies that user is allowed to see this order
4. When order status changes, server emits `order.status` to room `order:<orderId>`

Supported socket events:
```ts
socket.emit('subscribeOrder', { orderId: '...' });
socket.emit('unsubscribeOrder', { orderId: '...' });

socket.on('order.status', (event) => {
  console.log(event);
});
```

Example event payload:
```json
{
  "orderId": "9f2d0d7d-5f86-4e4a-a6cb-3d7f79bbf88e",
  "status": "PAID",
  "version": 1740752000000,
  "ts": 1740752000123
}
```

How to trigger an event in this project:
1. Create or find an order
2. Connect to `/realtime` with a JWT of the order owner or staff user
3. Send `subscribeOrder`
4. Update order status through `PUT /orders/:id`
5. Client receives `order.status`

Quick CLI check:
```bash
npm run ws:check -- --token=<JWT> --orderId=<ORDER_ID>
```

Optional params:
- `--url=http://localhost:3000/realtime`
- `--timeoutMs=30000`

### Relationships (Many-to-One)
- `Order` → `User` (many to one )
- `OrderItem` → `Order` (many to one)

### User
User module provides endpoints for creating a user and get all users.
Routes:
- GET /users
- POST /users
