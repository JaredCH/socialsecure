# Railway Deployment

This repo now supports **single-service deploy** on Railway:
- One service rooted at `social-media/`
- Railway build compiles `frontend/` automatically
- Backend serves React build + API from the same domain

## 1) Railway service settings

1. Connect repo and set **Root Directory** to `social-media`.
2. Keep config-as-code enabled (`railway.json`).
3. Public domain target port should be `5000`.
4. Set variables:
	- `NODE_ENV=production`
	- `JWT_SECRET=<strong-random-secret>` (required)
	- **Database**: Set ONE of these:
		- `MONGODB_URI=${{mongodb.MONGO_URL}}` (recommended - maps Railway Mongo URL)
		- `MONGO_URL=${{mongodb.MONGO_URL}}` (alternative)
		- `MONGO_PUBLIC_URL=${{mongodb.MONGO_PUBLIC_URL}}` (alternative)
	- `CLIENT_URL=https://<your-domain>`

### Raw variables (copy/paste)

For service `socialsecure` (Raw Editor):

```env
NODE_ENV=production
CLIENT_URL=https://socialsecure-production.up.railway.app
MONGODB_URI=${{mongodb.MONGO_URL}}
REDIS_URL=${{redis.REDIS_URL}}
SMTP_PORT=587
JWT_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET
```

Optional but fully-declared template lives in `.env.railway.template`.

Notes:
- Do not put quotes around values.
- If your Mongo/Redis service names are different, replace `mongodb` and `redis` with your actual Railway service names.
- Use Railway "Add Variable Reference" if Raw Editor rejects the reference syntax.
- `REACT_APP_API_URL` is optional now because frontend defaults to same-origin `/api`.

## 2) Endpoints

- Frontend app: `https://<your-domain>/`
- API base: `https://<your-domain>/api`
- Health check: `https://<your-domain>/health`

## 3) Verify after deploy

1. `/health` returns API JSON.
2. `/` loads the React app.
3. Browser network calls hit `/api/...` with no CORS errors.

## 4) Persistent storage (volumes)

Railway uses an ephemeral filesystem by default — uploaded files (gallery
images, marketplace photos, background images, chat audio) are lost on every
deploy or restart. Attach a **Railway Volume** so uploads persist.

1. Open your service in the Railway dashboard.
2. Go to **Settings → Volumes** (or right-click the service → **Add Volume**).
3. Add a volume with the mount path **`/app/uploads`**.
   - `/app` is the default working directory for Nixpacks builds. If your
     Railway root directory differs, adjust accordingly (e.g.
     `/app/social-media/uploads` when using a sub-directory root).
4. If your app stores private uploads (e.g. chat audio), add a second volume
   mounted at **`/app/private_uploads`**.
5. Redeploy the service so the volume mounts take effect.

After the volume is attached, files written to `uploads/` (gallery images,
hero banner images, profile pictures, marketplace listings, body backgrounds)
will survive deploys and restarts.

> **Tip:** You can verify the volume is working by uploading an image, then
> triggering a new deploy and confirming the image still loads.

## Common issues

- `CLIENT_URL` should be your Railway domain **without relying on trailing slash**.
- If Mongo auth fails, map `MONGODB_URI` directly to Railway Mongo `MONGO_URL`.
- `JWT_SECRET` should not be `change-this-in-production` in production.
- If uploaded images disappear after deploys, make sure a Railway Volume is
  mounted at `/app/uploads` (see section 4 above).

