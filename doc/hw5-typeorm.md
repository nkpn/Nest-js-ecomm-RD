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


## Idempotency example request (seed data)
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
