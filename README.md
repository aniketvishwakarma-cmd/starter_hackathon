# starter_hackathon

Node.js + Express + MongoDB starter kit with JWT authentication — built for the B2W Infotech Hackathon 2026. Comes with user registration/login, protected routes, and a clean folder structure to build on fast.

## Quick start

```bash
npm install
cp .env.example .env        # then fill in MONGO_URI and the two JWT secrets
npm run dev                 # http://localhost:5000
```

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Check it's alive: `GET http://localhost:5000/health`

## API

Base path: `/api`

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | Create account, returns tokens |
| POST | `/auth/login` | — | Log in, returns tokens |
| POST | `/auth/refresh` | refresh cookie | Rotate refresh token, new access token |
| POST | `/auth/logout` | refresh cookie | End the current session |
| GET | `/auth/me` | Bearer | Current user |
| POST | `/auth/logout-all` | Bearer | End every session for this user |
| PATCH | `/auth/password` | Bearer | Change password (revokes all sessions) |
| GET | `/protected` | Bearer | Example protected route |
| GET | `/admin` | Bearer + admin | Example role-gated route |

Every response follows the same shape:

```jsonc
// success
{ "success": true, "message": "Logged in", "data": { "user": {...}, "accessToken": "..." } }

// failure
{ "success": false, "message": "Validation failed", "errors": [{ "field": "email", "message": "Enter a valid email" }] }
```

### Example

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Aniket","email":"aniket@example.com","password":"Hackathon2026"}'

curl http://localhost:5000/api/auth/me -H "Authorization: Bearer <accessToken>"
```

`requests.http` has the full set ready to click through in VS Code (REST Client extension).

## How auth works

- **Access token** (15 min) — returned in the JSON body. Send it as `Authorization: Bearer <token>`.
- **Refresh token** (7 days) — set as an `httpOnly` cookie scoped to `/api/auth`, and also returned in the body so mobile/Postman clients can use it. Call `POST /api/auth/refresh` when an access token expires.
- **Rotation** — each refresh issues a new refresh token and invalidates the old one. Refresh tokens are stored SHA-256 hashed in the user document.
- **Reuse detection** — presenting an already-rotated refresh token wipes every session for that user, since it means a token leaked.

Password rules: min 8 chars, one lowercase, one uppercase, one number (see `src/validators/authValidators.js`).

## Frontend integration

Use `credentials: 'include'` so the refresh cookie travels, and add your frontend origin to `CORS_ORIGIN` in `.env`.

```js
const res = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ email, password }),
});
const { data } = await res.json();
localStorage.setItem('accessToken', data.accessToken);
```

When a request comes back `401 "Access token expired"`, call `/api/auth/refresh` once and retry.

## Project structure

```
src/
├── config/       env validation, mongo connection
├── controllers/  request handlers
├── middleware/   auth guard, validation, rate limits, error handler
├── models/       mongoose schemas
├── routes/       route definitions
├── validators/   zod schemas
├── utils/        token helpers, ApiError, asyncHandler
├── app.js        express app (middleware + routes)
└── server.js     startup, db connect, graceful shutdown
```

## Adding your own feature

1. Model → `src/models/Thing.js`
2. Zod schema → `src/validators/thingValidators.js`
3. Controller → `src/controllers/thingController.js`, wrap handlers in `asyncHandler`, throw `ApiError.badRequest(...)` for errors
4. Routes → `src/routes/thingRoutes.js`, add `requireAuth` where needed
5. Mount it in `src/routes/index.js`: `router.use('/things', thingRoutes)`

## What's included

Helmet security headers, CORS with credentials, rate limiting (20 auth attempts / 15 min, 300 API requests / 15 min), bcrypt hashing at 12 rounds, centralized error handling with Mongoose duplicate-key and cast-error mapping, role-based access control, and graceful shutdown.

## Before deploying

- Set `NODE_ENV=production` (enables `secure` cookies and hides stack traces)
- Use fresh random JWT secrets — never the ones from `.env.example`
- Set `CORS_ORIGIN` to your real frontend URL
- Never commit `.env` (already gitignored)
