# NestJS E-Comm (Pet Project)


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

