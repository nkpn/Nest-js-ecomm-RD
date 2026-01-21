# NestJS E-Comm (Pet Project)

## Architecture Vision 
This is a modular e-commerce service with Domain Driven Design Architecture (hopefully) that supports following modules:
- users
- orders
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


## Running the App
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
# User
User moduke provides 2 endpoints for creating a user and get all users.
Routes:
- Get /users
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
