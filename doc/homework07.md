## Why I chose Code-First
I chose **code-first** because I am working alone and want to keep the schema close to the business (code) logic. With the code-first, I define types using decorators in the same files where I implement resolvers, so I avoid duplicating schema definitions and reduce sync errors between `.graphql` and TypeScript code. It is faster for a small project and keeps everything in one place, which matches my current workflow and scope.

## Error handling (GraphQL)
- Invalid filter/pagination → GraphQL validation error (BadRequestException with clear message).
- Nothing found → return empty list (`nodes: []`, `totalCount: 0`), no exception.
- DB/service errors → GraphQL error with short message, plus server logs.

**Example error response (invalid date range)**
```json
{
  "errors": [
    {
      "message": "dateFrom must be <= dateTo",
      "extensions": { "code": "BAD_REQUEST" }
    }
  ],
  "data": null
}
```

## 3.2 Pagination
You can see the Connection pattern for orders:

```graphql
type OrdersConnection {
  nodes: [Order!]!
  totalCount: Int!
  pageInfo: PageInfo!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
}
```

Query example:
```graphql
query Orders($filter: OrdersFilterInput, $pagination: OrdersPaginationInput) {
  orders(filter: $filter, pagination: $pagination) {
    totalCount
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
    nodes {
      id
      status
      createdAt
      items {
        quantity
        product {
          id
          name
          price
        }
      }
    }
  }
}
```

## GraphQL N+1 (DataLoader)
**How I verified N+1 before DataLoader**
- I enabled SQL logging in TypeORM and ran this query:
  `query {
  orders {
    nodes {
      items {
        product {
          id
          name
        }
      }
    }
  }
}
`
- Example log before DataLoader (N+1, repeated `products` query):
  ```
  query: SELECT COUNT(DISTINCT("order"."id")) AS "cnt" FROM "orders" "order" LEFT JOIN "order_items" "item" ON "item"."order_id"="order"."id"
  query: SELECT "order"."id" AS "order_id", "order"."user_id" AS "order_user_id", "order"."status" AS "order_status", "order"."idempotency_key" AS "order_idempotency_key", "order"."created_at" AS "order_created_at", "order"."updated_at" AS "order_updated_at", "item"."id" AS "item_id", "item"."order_id" AS "item_order_id", "item"."product_id" AS "item_product_id", "item"."quantity" AS "item_quantity", "item"."price_snapshot" AS "item_price_snapshot", "item"."created_at" AS "item_created_at", "item"."updated_at" AS "item_updated_at" FROM "orders" "order" LEFT JOIN "order_items" "item" ON "item"."order_id"="order"."id" ORDER BY "order"."created_at" DESC
  query: SELECT "Product"."id" AS "Product_id", "Product"."name" AS "Product_name", "Product"."sku" AS "Product_sku", "Product"."description" AS "Product_description", "Product"."price" AS "Product_price", "Product"."stock" AS "Product_stock", "Product"."is_active" AS "Product_is_active", "Product"."created_at" AS "Product_created_at", "Product"."updated_at" AS "Product_updated_at" FROM "products" "Product" WHERE (("Product"."id" = $1)) LIMIT 1 -- PARAMETERS: ["dc47..."]
  ```

- The log below is after DataLoader (batched), not “before”:
  ```
  query: SELECT COUNT(DISTINCT("order"."id")) AS "cnt" FROM "orders" "order" LEFT JOIN "order_items" "item" ON "item"."order_id"="order"."id"
  query: SELECT "order"."id" AS "order_id", "order"."user_id" AS "order_user_id", "order"."status" AS "order_status", "order"."idempotency_key" AS "order_idempotency_key", "order"."created_at" AS "order_created_at", "order"."updated_at" AS "order_updated_at", "item"."id" AS "item_id", "item"."order_id" AS "item_order_id", "item"."product_id" AS "item_product_id", "item"."quantity" AS "item_quantity", "item"."price_snapshot" AS "item_price_snapshot", "item"."created_at" AS "item_created_at", "item"."updated_at" AS "item_updated_at" FROM "orders" "order" LEFT JOIN "order_items" "item" ON "item"."order_id"="order"."id" ORDER BY "order"."created_at" DESC
  query: SELECT "Product"."id" AS "Product_id", "Product"."name" AS "Product_name", "Product"."sku" AS "Product_sku", "Product"."description" AS "Product_description", "Product"."price" AS "Product_price", "Product"."stock" AS "Product_stock", "Product"."is_active" AS "Product_is_active", "Product"."created_at" AS "Product_created_at", "Product"."updated_at" AS "Product_updated_at" FROM "products" "Product" WHERE (("Product"."id" IN ($1))) -- PARAMETERS: [\"dc4781b0-43d9-4edd-a98c-882331c17846\"]
  ```
- Explanation of this log:
  - First query (`COUNT`) is for `totalCount`.
  - Second query loads `orders + items`.
  - Third query is the **batched** DataLoader query (`products WHERE id IN (...)`).
  - This means **N+1 is already fixed** in this log.

**After DataLoader**
- The product resolution is batched per request using `DataLoader`.
- Logs show a single query like:
  `SELECT ... FROM products WHERE id IN (...)`
- This reduced the number of product queries from N (per item) to 1 per request.

## What to submit (summary)
- **Schema approach:** code-first (explained above).
- **Orders query:** business logic is in `OrdersService.getAllConnection`, resolvers are thin.
- **DataLoader:** `ProductLoader` batches `productId` per request; N+1 removed with `IN (...)` query.
- **Example query to test:**
```graphql
query Orders($filter: OrdersFilterInput, $pagination: OrdersPaginationInput) {
  orders(filter: $filter, pagination: $pagination) {
    totalCount
    pageInfo { hasNextPage hasPreviousPage }
    nodes {
      id
      status
      createdAt
      items {
        quantity
        product { id name price }
      }
    }
  }
}
```

## Queries to test error handling
Use these in GraphQL Playground.

### 1) Invalid pagination -> GraphQL validation error
```graphql
query InvalidPagination {
  orders(pagination: { limit: 0, offset: -1 }) {
    totalCount
    nodes { id }
  }
}
```
Expected: error (`BAD_REQUEST`) with message "limit must not be less than 1", "offset must not be less than 0"

### 2) Invalid date range -> GraphQL validation/business error
```graphql
query InvalidDateRange {
  orders(filter: { dateFrom: "2026-03-01T00:00:00.000Z", dateTo: "2026-02-01T00:00:00.000Z" }) {
    totalCount
    nodes { id }
  }
}
```
Expected: error (`BAD_REQUEST`) with message `dateFrom must be <= dateTo`.

### 3) Nothing found -> empty list, no exception
```graphql
query EmptyResult {
  orders(filter: { status: CANCELLED }, pagination: { limit: 10, offset: 0 }) {
    totalCount
    pageInfo { hasNextPage hasPreviousPage }
    nodes { id status }
  }
}
```
Expected: success response with `totalCount: 0` and `nodes: []`.

### 4) Internal DB/service error -> normal GraphQL error (short message)
```graphql
query ForceDbFailure {
  orders(filter: { status: CREATED }) {
    totalCount
  }
}
```
How to test:
- stop database container,
- execute the query above.

Expected:
- GraphQL error with short message `Failed to fetch orders`,
- server log contains detailed DB error stack.
