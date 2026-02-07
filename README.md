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

## Environment Configuration
The app reads environment variables from:
- `.env.dev` for development
- `.env.prod` for production

Example variable:
```
TEST_ID=abc123
```


## Viewing TEST_ID
To see `TEST_ID` in the response, make sure it exists in the active env file and then call the root endpoint (localhost:3000)
