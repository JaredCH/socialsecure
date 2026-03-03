# Railway Deployment

Use two Railway services in the same project:
- Backend API service rooted at `social-media/`
- Frontend service rooted at `social-media/frontend/`

## 1) Backend service

1. Connect repo and set **Root Directory** to `social-media`.
2. Keep start command as `npm start`.
3. Public domain target port should be `5000`.
4. Set variables:
	- `NODE_ENV=production`
	- `JWT_SECRET=<strong-random-secret>`
	- `MONGODB_URI=<railway-mongodb-connection-string>`
	- `CLIENT_URL=<your-frontend-domain>`
5. For Railway Mongo, prefer the plugin-provided URL variable (copy/paste exact value from the Mongo service).

## 2) Frontend service

1. Create a second service from the same repo.
2. Set **Root Directory** to `social-media/frontend`.
3. Build command: `npm run build`.
4. Start command: `npm start`.
5. Set variable:
	- `REACT_APP_API_URL=https://<your-backend-domain>/api`

## 3) Verify after deploy

1. Backend health: `https://<backend-domain>/` should return API JSON.
2. Frontend loads at its Railway URL.
3. Browser network calls from frontend should hit `https://<backend-domain>/api/...` with no CORS errors.

## Common issues

- `CLIENT_URL` must be the frontend URL, not the backend URL.
- If Mongo auth fails, your URI is not the exact Railway Mongo connection string.
- `JWT_SECRET` should not be `change-this-in-production` in production.

