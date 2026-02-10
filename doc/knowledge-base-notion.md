
## Migrations
**Purpose**
- Keep DB schema changes versioned and repeatable.

**Key files**
- `data-source.ts`
- `src/migrations/*.ts`

**Scripts**
```bash
npm run migration:generate -- src/migrations/Init
npm run migration:run
npm run migration:revert
```

**Indexes added (migration)**
- `IDX_orders_idempotency_key_unique` on `orders(idempotency_key)`
- `idx_orders_status_created_at` on `orders(status, created_at DESC)`

Migration file:
- `src/migrations/1770390000000-AddIndexes.ts`

## Idempotency (1.1)
**Goal**
- Double-submit safe `POST /orders`.

**How it works**
- Client sends `Idempotency-Key` header.
- Server checks `orders.idempotency_key`.
- If key exists → return existing order.
- If key is new → create order.
- Unique index prevents race duplicates.

**Controller**
```ts
@Post()
create(
  @Body() body: CreateOrderDto,
  @Res({ passthrough: true }) res: Response,
  @Headers('Idempotency-Key') idempotencyKey?: string,
): Promise<Order> {
  return this.ordersService.create(body, idempotencyKey).then((result) => {
    res.status(result.wasDuplicate ? HttpStatus.OK : HttpStatus.CREATED);
    return result.order;
  });
}
```
## Transactions (1.2)
**Goal**
- One transaction for order + items + stock updates + idempotency key.

**Approach**
- `QueryRunner` with `connect()`, `startTransaction()`, `commit/rollback`, `release()`.

**Core pattern**
```ts
const queryRunner = dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  // create order, update stock, create items
  await queryRunner.commitTransaction();
  return savedOrder;
} catch (error) {
  await queryRunner.rollbackTransaction();
  throw error;
} finally {
  await queryRunner.release();
}
```


## Oversell Protection
**Mechanism**
- Pessimistic locking on product rows inside the transaction.

**Code**
```ts
const product = await queryRunner.manager.findOne(Product, {
  where: { id: item.productId },
  lock: { mode: 'pessimistic_write' },
});
```

## Hot Query Optimization (2.x)
**Query**
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

**Index**
```sql
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
ON orders (status, created_at DESC);
```

**Why faster**
- Same SQL, but index lets Postgres filter by `status` + `created_at` faster and sort more efficiently.

## E2E Tests (Correctness)
**File**
- `test/orders.e2e-spec.ts`

**Covered**
- Idempotency: same key → same order (201 then 200)
- No partial writes: failure → no orders/items saved
- Oversell: two parallel requests → one success, one 409
