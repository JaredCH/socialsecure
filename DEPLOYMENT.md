# Railway Deployment

## Backend (`social-media`)

1. Create a new Railway project and connect this repository.
2. Set the service root to `social-media/`.
3. Railway will use [`railway.json`](railway.json) and run `npm start`.
4. Add environment variables from [`.env.example`](.env.example).
5. Provision MongoDB (Railway plugin or external MongoDB Atlas) and set `MONGODB_URI`.
6. Set `CLIENT_URL` to your frontend URL.

## Frontend (`social-media/frontend`)

Deploy as a separate service:

1. Create a second Railway service with root `social-media/frontend/`.
2. Build command: `npm run build`.
3. Start command: `npx serve -s build -l $PORT` (or use another static host).
4. Set `REACT_APP_API_URL` to backend URL + `/api`.

## Notes

- Private PGP keys are client-side only via [`pgp.js`](frontend/src/utils/pgp.js).
- Universal account referral routes are implemented in [`routes/universal.js`](routes/universal.js).
- Ensure CORS `CLIENT_URL` matches deployed frontend domain.

