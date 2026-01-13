# NestJS E-Comm (Pet Project)

## Environment Configuration
The app reads environment variables from:
- `.env.dev` for development
- `.env.prod` for production

Example variable:
```
TEST_ID=abc123
```

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

## Viewing TEST_ID
To see `TEST_ID` in the response, make sure it exists in the active env file and then call the root endpoint (localhost:3000)

