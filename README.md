# Paani Ghar — Backend API

A small Node.js + Express API: register/login (JWT), tanker requests, ratings,
and complaints. Tested end-to-end locally (register → login → book → accept →
complete → rate → complain).

## Run locally
```
npm install
npm start
```
Server listens on `http://localhost:4000` (or `$PORT` if set).

## Deploy to Render
1. Push this folder to a new GitHub repo (keep `render.yaml` at the repo root).
2. In Render: **New → Blueprint**, pick the repo. Render reads `render.yaml`
   automatically and creates a free Web Service with:
   - Build command: `npm install`
   - Start command: `npm start`
   - A random `JWT_SECRET` generated for you.
3. Click **Apply**. After the first deploy, your API is live at
   `https://paani-ghar-api.onrender.com` (or whatever name Render gives it).
4. Test it: `curl https://<your-app>.onrender.com/api/health` should return
   `{"ok":true,...}`.
5. Put that URL into the app's `API_BASE` (see the frontend's `config.js`).

No database setup needed to get started — data is stored in a JSON file next
to the server code.

## ⚠️ Important: this storage is temporary
Render's **free tier disk is ephemeral** — every time you redeploy (or the
free service spins down from inactivity and restarts), `data.json` can be
wiped and all accounts/requests disappear. This is fine for testing with
friends, but **not safe for a real launch**.

### Moving to a real database (Postgres) before launch
1. In Render, create a free **PostgreSQL** instance.
2. Replace `db.js`'s file read/write with a Postgres client (e.g. `pg`), and
   create tables for `users`, `requests`, `complaints` matching the fields
   already used in `server.js` (the API routes don't need to change, only
   how `data.users` / `data.requests` / `data.complaints` are loaded/saved).
3. Add the Postgres connection string Render gives you as an environment
   variable (`DATABASE_URL`) on the web service.
I can write this Postgres version for you when you're ready — it's a
contained change to `db.js` only.

## API summary
- `POST /api/auth/register` `{name, contact, mobile, password, role, district, area}`
- `POST /api/auth/login` `{contact, password}`
- `GET /api/me` (auth)
- `PATCH /api/me` `{name?, mobile?, district?, area?, online?}` (auth)
- `PATCH /api/me/password` `{oldPassword, newPassword}` (auth)
- `DELETE /api/me` (auth)
- `POST /api/requests` (auth, customer)
- `GET /api/requests/mine` (auth, customer)
- `GET /api/requests/open?district=&area=` (auth, provider)
- `GET /api/requests/jobs` (auth, provider)
- `PATCH /api/requests/:id/accept` (auth, provider)
- `PATCH /api/requests/:id/complete` (auth, provider)
- `PATCH /api/requests/:id/cancel` (auth, customer)
- `POST /api/requests/:id/rate` `{rating, review?}` (auth, customer)
- `GET /api/provider/:contact/stats` (public)
- `POST /api/complaints` `{type, description}` (auth)
- `GET /api/complaints/mine` (auth)
- `GET /api/health`

All authenticated routes need `Authorization: Bearer <token>` from
login/register.
