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

## gRPC Payments Microservice

### Local run: 2 services, 2 processes

Prerequisites for `orders-service`:
```bash
docker compose up -d postgres rabbitmq
npm i
npm run migration:run
```

Terminal 1 (`payments-service`, gRPC server on `5022`):
```bash
PAYMENTS_GRPC_BIND_URL=0.0.0.0:5022 NODE_ENV=dev npm run start:payments:dev
```

Terminal 2 (`orders-service`, HTTP on `3000`):
```bash
PAYMENTS_GRPC_URL=localhost:5022 PAYMENTS_GRPC_TIMEOUT_MS=1000 PORT=3000 NODE_ENV=dev npm run start:dev
```

Required env for this flow:
- `PAYMENTS_GRPC_BIND_URL` — where payments gRPC server listens (default `0.0.0.0:5022`)
- `PAYMENTS_GRPC_URL` — where orders gRPC client connects (default `localhost:5022`)
- `PAYMENTS_GRPC_TIMEOUT_MS` — deadline/timeout for Authorize RPC (default `1000`)
- `PAYMENTS_GRPC_AUTHORIZE_MAX_RETRIES` — max retries for Authorize on transient gRPC failures (default `2`)
- `PAYMENTS_GRPC_RETRY_BACKOFF_MS` — base retry backoff in ms (default `150`)
- `PAYMENTS_GRPC_RETRY_MAX_BACKOFF_MS` — max retry backoff cap in ms (default `2000`)
- `PORT` — orders HTTP port (default `3000`)

Retry behavior:
- only transient gRPC errors are retried (`UNAVAILABLE`)
- backoff is exponential: `base * 2^(attempt-1)` with max cap
- non-transient gRPC failures are returned immediately without retries

### Happy path via curl

1. Create user:
```bash
USER_ID=$(curl -sS -X POST http://localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"email":"grpc.user@example.com","password":"secret123"}' | jq -r '.id')
```

2. Create product:
```bash
PRODUCT_ID=$(curl -sS -X POST http://localhost:3000/products \
  -H 'content-type: application/json' \
  -d '{"name":"gRPC Demo Product","sku":"grpc-demo-1","price":199.99,"stock":5,"isActive":true}' | jq -r '.id')
```

3. Create order:
```bash
ORDER_ID=$(curl -sS -X POST http://localhost:3000/orders \
  -H 'content-type: application/json' \
  -d "{\"userId\":\"$USER_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":1,\"priceSnapshot\":199.99}]}" | jq -r '.id')
```

4. Authorize payment through Orders -> Payments gRPC:
```bash
AUTH_RESPONSE=$(curl -sS -X POST "http://localhost:3000/orders/$ORDER_ID/payments/authorize" \
  -H 'content-type: application/json' \
  -d '{"currency":"USD"}')
echo "$AUTH_RESPONSE"
PAYMENT_ID=$(echo "$AUTH_RESPONSE" | jq -r '.paymentId')
```

Expected response shape:
```json
{
  "paymentId": "uuid",
  "status": "PAYMENT_STATUS_AUTHORIZED"
}
```

5. Get payment status:
```bash
curl -sS "http://localhost:3000/orders/payments/$PAYMENT_ID/status"
```

### Where `.proto` lives and how it is wired

- Contract file: `proto/payments.proto`
- `orders-service` gRPC client uses this contract in `src/orders/order.module.ts`:
  - `protoPath: join(process.cwd(), 'proto/payments.proto')`
  - `package: payments.v1`
- `payments-service` gRPC server uses the same contract in `src/payments-service/main.ts`:
  - `protoPath: join(process.cwd(), 'proto/payments.proto')`
  - `package: payments.v1`

No direct imports from `payments-service` into `orders-service` are used for RPC flow; communication is contract-only via `.proto`.

### gRPC Status -> Orders Domain Errors (HTTP)

- `INVALID_ARGUMENT` -> `400 ORDERS_PAYMENT_VALIDATION_FAILED`
- `NOT_FOUND` -> `404 ORDERS_PAYMENT_NOT_FOUND`
- `FAILED_PRECONDITION` / `ALREADY_EXISTS` -> `409 ORDERS_PAYMENT_CONFLICT`
- `DEADLINE_EXCEEDED` -> `504 ORDERS_PAYMENT_TIMEOUT`
- `UNAVAILABLE` -> `503 ORDERS_PAYMENT_UNAVAILABLE`
- fallback -> `502 ORDERS_PAYMENT_INTEGRATION_ERROR`

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
- `result` (`success` / `dedup` / `retry` / `dlq`)
- short `reason` (for failures/retries)

Example log line:
```text
result=retry messageId=... orderId=... attempt=1 reason=Order not found; nextAttempt=2; delayMs=2000
```

## HW12 Runtime Verification (No Manual SQL)

These commands validate all required scenarios end-to-end:
- happy path
- retry
- DLQ
- idempotency (`messageId` dedup)

Prerequisites:
- Docker + Docker Compose
- Node.js (for helper script)
- `jq` and `rg` installed locally

### 1) Start stack and initialize DB

```bash
export DB_PASS=postgres
export JWT_SECRET=test_secret
export PORT=8080
export RABBITMQ_PORT=5673
export RABBITMQ_MGMT_PORT=15673

docker compose -f compose.yml up -d --build postgres rabbitmq api
docker compose -f compose.yml run --rm migrate
docker compose -f compose.yml run --rm seed
```

### 2) Prepare IDs for order creation

```bash
API_URL="http://localhost:${PORT}"
USER_ID=$(curl -fsS "$API_URL/users" | jq -r '.[0].id')
PRODUCT_ID=$(curl -fsS "$API_URL/products" | jq -r '.[] | select(.stock > 0) | .id' | head -n1)

echo "USER_ID=$USER_ID"
echo "PRODUCT_ID=$PRODUCT_ID"
```

### 3) Happy path (`PENDING -> PROCESSED`)

```bash
CREATE_RESPONSE=$(curl -fsS -X POST "$API_URL/orders" \
  -H "content-type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":1,\"priceSnapshot\":9.99}]}")

ORDER_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id')
echo "$CREATE_RESPONSE" | jq -r '.status'
```

Expected immediately after `POST /orders`:
- HTTP response is fast
- initial status is `PENDING`

Wait for worker processing:

```bash
until [ "$(curl -fsS "$API_URL/orders/$ORDER_ID" | jq -r '.status')" = "PROCESSED" ]; do
  sleep 1
done

curl -fsS "$API_URL/orders/$ORDER_ID" | jq '{status, processedAt}'
```

Expected:
- `status = "PROCESSED"`
- `processedAt` is not `null`

### 4) Retry scenario (transient failure)

```bash
BROKER_URL="amqp://guest:guest@localhost:${RABBITMQ_PORT}"
INVALID_ORDER_ID="00000000-0000-0000-0000-000000000000"
RETRY_MESSAGE_ID=$(node -e "console.log(require('node:crypto').randomUUID())")

node scripts/publish-order-message.js \
  --url "$BROKER_URL" \
  --queue orders.process \
  --orderId "$INVALID_ORDER_ID" \
  --messageId "$RETRY_MESSAGE_ID" \
  --attempt 0

sleep 3
docker compose -f compose.yml logs --since=30s api | rg "$RETRY_MESSAGE_ID"
```

Expected in logs:
- at least one `result=retry ... attempt=0`
- then `result=retry ... attempt=1`

### 5) DLQ after max attempts

```bash
sleep 3
docker compose -f compose.yml logs --since=60s api | rg "$RETRY_MESSAGE_ID"
docker compose -f compose.yml exec -T rabbitmq rabbitmqctl list_queues name messages | rg 'orders\\.process|orders\\.retry\\.process|orders\\.dlq'
```

Expected:
- log line with `result=dlq ... attempt=2`
- `orders.dlq` message counter increases

### 6) Idempotency scenario (same `messageId` twice)

```bash
DEDUP_MESSAGE_ID=$(node -e "console.log(require('node:crypto').randomUUID())")
PROCESSED_AT_BEFORE=$(curl -fsS "$API_URL/orders/$ORDER_ID" | jq -r '.processedAt')

node scripts/publish-order-message.js \
  --url "$BROKER_URL" \
  --queue orders.process \
  --orderId "$ORDER_ID" \
  --messageId "$DEDUP_MESSAGE_ID" \
  --attempt 0

node scripts/publish-order-message.js \
  --url "$BROKER_URL" \
  --queue orders.process \
  --orderId "$ORDER_ID" \
  --messageId "$DEDUP_MESSAGE_ID" \
  --attempt 0

sleep 2
PROCESSED_AT_AFTER=$(curl -fsS "$API_URL/orders/$ORDER_ID" | jq -r '.processedAt')
test "$PROCESSED_AT_BEFORE" = "$PROCESSED_AT_AFTER" && echo "processedAt unchanged"
docker compose -f compose.yml logs --since=60s api | rg "$DEDUP_MESSAGE_ID"
```

Expected:
- one line with `result=success ... reason=already_processed`
- one line with `result=dedup ... reason=duplicate_message_id`
- `processedAt` stays unchanged, so duplicate delivery does not duplicate side effects

### 7) Cleanup

```bash
docker compose -f compose.yml down -v --remove-orphans
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
