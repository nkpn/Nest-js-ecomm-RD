## Homework 12: RabbitMQ (Orders Producer + Worker)

## 1) How to Run

1. Prepare env:
```bash
cp .env.example .env
```

2. Start PostgreSQL and RabbitMQ:
```bash
docker compose -f docker-compose.yml up -d postgres rabbitmq
```

3. Install dependencies:
```bash
npm i
```

4. Run migrations:
```bash
npm run migration:run
```

5. Seed test data (users/products):
```bash
npm run seed
```

6. Start API + worker (the worker runs in the same NestJS process):
```bash
npm run start:dev
```

7. Availability check:
- API: `http://localhost:3000`
- RabbitMQ Management UI: `http://localhost:15673` (`guest/guest`)

---

## 2) RabbitMQ Topology

The project uses the default exchange `""` (publishing via `sendToQueue`).

Queues:
- `orders.process` - main order processing queue.
- `orders.retry.process` - retry queue with delay (TTL).
- `orders.dlq` - dead letter queue for messages after retry limit or invalid payload.

`orders.retry.process` arguments:
- `x-dead-letter-exchange = ""`
- `x-dead-letter-routing-key = orders.process`

Message flow:
1. `POST /orders` creates an order in DB with status `PENDING`.
2. Producer publishes a message to `orders.process`.
3. Worker consumes from `orders.process`.
4. If processing fails and attempts remain: republish to `orders.retry.process` with `attempt + 1` and `expiration=<delayMs>`.
5. After TTL, the message from `orders.retry.process` is routed back to `orders.process` (via DLX routing).
6. After `MAX_ATTEMPTS`, message is published to `orders.dlq`.

---

## 3) Selected Retry Mechanism

Selected approach: **Variant A (republish + ack)** with a delayed retry queue.

Key rules:
- `manual ack` (`noAck: false`).
- `ack` only after processing step completion (success/retry/dlq decision).
- max attempts: `ORDERS_MAX_ATTEMPTS` (default `3`).
- backoff: exponential (`ORDERS_RETRY_BASE_DELAY_MS * 2^(nextAttempt-1)`), capped by `ORDERS_RETRY_MAX_DELAY_MS`.

ENV parameters:
- `ORDERS_MAX_ATTEMPTS=3`
- `ORDERS_RETRY_BASE_DELAY_MS=1000`
- `ORDERS_RETRY_MAX_DELAY_MS=30000`

---

## 4) How to Reproduce 4 Scenarios

### Postman Environment

- `apiBase = http://localhost:3000`
- `rmqApiBase = http://localhost:15673/api`
- `rmqUser = guest`
- `rmqPass = guest`

### 4.1 Happy Path

1. Create order:
`POST {{apiBase}}/orders`
```json
{
  "userId": "<existing-user-id>",
  "items": [
    {
      "productId": "<existing-product-id>",
      "quantity": 1,
      "priceSnapshot": 100
    }
  ]
}
```

2. In response, order must have `status = PENDING` (creation is synchronous, processing is asynchronous).

3. After 1-2 seconds, check:
`GET {{apiBase}}/orders/<orderId>`

Expected:
- `status = PROCESSED`
- `processedAt != null`

### 4.2 Retry

Idea: publish a business message with an `orderId` that does not exist in DB. Worker cannot process it and will retry.

`POST {{rmqApiBase}}/exchanges/%2F/amq.default/publish`
Auth: Basic Auth (`{{rmqUser}}` / `{{rmqPass}}`)
Header: `Content-Type: application/json`
```json
{
  "properties": {
    "delivery_mode": 2,
    "message_id": "11111111-1111-1111-1111-111111111111",
    "correlation_id": "99999999-9999-9999-9999-999999999999",
    "content_type": "application/json"
  },
  "routing_key": "orders.process",
  "payload": "{\"messageId\":\"11111111-1111-1111-1111-111111111111\",\"orderId\":\"99999999-9999-9999-9999-999999999999\",\"createdAt\":\"{{$isoTimestamp}}\",\"attempt\":0}",
  "payload_encoding": "string"
}
```

What to verify:
- Postman returns `200` + `"routed": true` (this only confirms broker routing).
- Worker logs contain `result=retry` entries for early attempts.

### 4.3 DLQ

For the same message from p.4.2, after max attempts you should get `result=dlq`.

Verification via UI:
- `Queues and Streams` -> `orders.dlq` -> messages are present in queue.

Verification via API (Postman):
`POST {{rmqApiBase}}/queues/%2F/orders.dlq/get`
Auth: Basic Auth (`{{rmqUser}}` / `{{rmqPass}}`)
Header: `Content-Type: application/json`
```json
{
  "count": 5,
  "ackmode": "ack_requeue_true",
  "encoding": "auto",
  "truncate": 50000
}
```

### 4.4 Idempotency

1. Take an existing `orderId`.
2. Publish the **same** message twice with the same `messageId`.
3. First delivery processes the order, second is treated as duplicate.

Publish example (run it 2 times with the same `messageId`):
`POST {{rmqApiBase}}/exchanges/%2F/amq.default/publish`
```json
{
  "properties": {
    "delivery_mode": 2,
    "message_id": "22222222-2222-2222-2222-222222222222",
    "correlation_id": "<existing-order-id>",
    "content_type": "application/json"
  },
  "routing_key": "orders.process",
  "payload": "{\"messageId\":\"22222222-2222-2222-2222-222222222222\",\"orderId\":\"<existing-order-id>\",\"createdAt\":\"{{$isoTimestamp}}\",\"attempt\":0}",
  "payload_encoding": "string"
}
```

DB verification (must be only 1 row for this `message_id`):
```bash
docker exec -it nest-js-ecomm-rd-postgres-1 psql -U postgres -d lecture5 -c "SELECT message_id, order_id, processed_at FROM processed_messages WHERE message_id = '22222222-2222-2222-2222-222222222222';"
```

---

## 5) How Idempotency Is Implemented

The project uses `processed_messages` table:
- `message_id` (PK/unique)
- `order_id` (FK -> `orders.id`)
- `handler` (optional)
- `processed_at`

Transactional algorithm:
1. Worker receives message.
2. At transaction start, it executes `INSERT` into `processed_messages`.
3. If `unique violation` on `message_id`:
   - this is a duplicate delivery,
   - business logic is not executed again,
   - message is acknowledged (`ack`).
4. If `INSERT` succeeds:
   - run main logic (`orders.status = PROCESSED`, `processed_at`),
   - `commit`,
   - `ack`.

Why this is safe with parallel workers:
- uniqueness of `message_id` guarantees only one worker can commit processing marker;
- concurrent workers get `unique violation` and do not produce duplicate side effects.
