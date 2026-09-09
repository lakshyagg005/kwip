# KWIP Standalone YouTube Transcript Worker

This is a lightweight microservice for extracting YouTube video transcripts outside of serverless cloud datacenter IP blocks (e.g., AWS/Vercel IP ranges).

## Deployment Instructions (Railway / Render / VPS)

### 1. Deploy Container
- Push this repo or the `worker/` subdirectory to GitHub.
- On **Railway** or **Render**, create a new Web Service using `worker/Dockerfile` or standard Node environment.
- Set Environment Variables:
  - `PORT`: `8080` (or host default)
  - `TRANSCRIPT_WORKER_SECRET`: `<YOUR_RANDOM_SECRET_KEY>`

### 2. Configure Vercel Project Environment Variables
In your Vercel Dashboard for KWIP, add:
- `TRANSCRIPT_WORKER_URL`: `https://your-worker-service.up.railway.app`
- `TRANSCRIPT_WORKER_SECRET`: `<YOUR_RANDOM_SECRET_KEY>`

### 3. Verification
Send a test POST request:
```bash
curl -X POST https://your-worker-service.up.railway.app/api/transcript \
  -H "Authorization: Bearer <YOUR_RANDOM_SECRET_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"videoId": "dQw4w9WgXcQ"}'
```
