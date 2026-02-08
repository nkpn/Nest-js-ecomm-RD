# HW5: TypeORM Flow

## 1) Add or update entities
- Create/update entities in `src/**/entity/*.entity.ts`.
- If there are relations (`ManyToOne`, `OneToMany`, etc.) verify imports and types.
- Ensure entities are included in `data-source.ts` (`entities` array).

## 2) Configure TypeORM connection
- Check variables in `.env` / `.env.dev`:
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_SSL`
- In `data-source.ts`:
  - `synchronize: false`
  - `migrations: ['src/migrations/*.ts']`
  - `entities: [User, Product, Order, OrderItem, ...]`

## 3) Generate migration
1. Start the database:
   ```bash
   docker compose up -d
   ```
2. Generate migration:
   ```bash
   npm run migration:generate -- src/migrations/Init
   ```
   This compares entities to the current DB schema and generates SQL changes.

## 4) Run migrations
```bash
npm run migration:run
```
- Creates tables/indexes in the DB.
- Writes a record into the `migrations` table.

## 5) Seed data
```bash
npm run seed
```
- Inserts test data from `src/seeds/seed.ts`.

## 6) Start the API
```bash
npm run start:dev
```

## IDEMPOTENCY

**How idempotency works**
- Client sends `Idempotency-Key` header.
- Server checks `orders.idempotency_key` before creating a new order.
- If the key already exists, the same order is returned (`200` on retry, `201` on first create).
- Unique index on `orders.idempotency_key` protects against race conditions.

## Idempotency example request (seed data) (1 task)
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 9b2b7c7a-1f4e-4f43-baa7-2a7c79e9a3f1" \
  -d '{
    "userId": "abaabb21-c009-46e1-939b-468d1fe12bd1",
    "items": [
      { "productId": "aa9aff87-6764-4aa5-8613-d17c426f6075", "quantity": 1, "priceSnapshot": 10.00 }
    ]
  }'
```

## SUMMARY
**How the transaction is implemented**
- `QueryRunner` is used with `connect()`, `startTransaction()`, `commitTransaction()`, `rollbackTransaction()`, and `release()` in `finally`.
- Order creation, order items creation, stock updates, and idempotency key are all inside one transaction.

## Oversell protection (locking)
In the project I am using a pessimistic lock in the transaction:
- Pessimistic locking with `pessimistic_write` (`SELECT ... FOR UPDATE`) on Product rows.
- Other transactions must wait, so two requests cannot read the same stock at once.
- This keeps the logic simple: read → validate → update.

**Why I chose pessimistic lock**
- The project already uses `QueryRunner` with explicit transactions.
- TypeORM supports `pessimistic_write` cleanly via the manager.
- It keeps the code consistent with the current read/validate/update flow.



## Error handling
- **Insufficient stock:** `409 Conflict` (business conflict with current state).
- **Duplicate idempotencyKey:** return the existing order.
  `201 Created` for the first request, `200 OK` for retries.
- **Any other error:** rollback the transaction and return `500`.


**Optimized query and added indexes**
- Query: orders list with filters `status`, `created_at` and total amount > 20.
- Added indexes:
  - `IDX_orders_idempotency_key_unique` on `orders(idempotency_key)`.
  - `idx_orders_status_created_at` on `orders(status, created_at DESC)`.

## SQL query optimization (2)
**SQL query v1**
```sql
SELECT
  o.id,
  o.status,
  o.created_at,
  SUM(oi.quantity * oi.price_snapshot) AS total_amount
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'CREATED'
  AND o.created_at >= '2026-02-01'
  AND o.created_at < '2026-03-01'
GROUP BY o.id, o.status, o.created_at
HAVING SUM(oi.quantity * oi.price_snapshot) > 20
ORDER BY o.created_at DESC;
```

**Files location**
- SQL queries:
  - `homework/SQL-optimise/request-before.sql`
  - `homework/SQL-optimise/request-after.sql`
- Benchmark runner:
  - `homework/SQL-optimise/test.ts`

**What the test script does**
- Connects to Postgres using `.env` variables.
- Runs each SQL query 30 times (with a small warmup).
- Measures execution time and prints `min/avg/max/p95`.

**How to run**
```bash
npx ts-node homework/SQL-optimise/test.ts
```

**Why the optimized version is faster**
- The SQL text is the same, but the database uses an index:
  `idx_orders_status_created_at (status, created_at DESC)`.
- With the index, Postgres filters by `status` and `created_at` faster and can sort more efficiently.
- Benchmark (30 runs):
  - **Before:** avg 0.578 ms, min 0.393 ms, max 1.080 ms, p95 0.952 ms
  - **After:** avg 0.390 ms, min 0.348 ms, max 0.541 ms, p95 0.476 ms
