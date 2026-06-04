# INDANE SALES MONITORING - Public Online Checklist

## Correct Link For Seniors

Use only the HTTPS public link:

```text
https://indane-sales-monitoring.vercel.app/
```

Do not share `http://127.0.0.1:8095` with seniors. That address opens only on the same PC where the local server is running.

## If Public Site Does Not Open

1. Ask the senior to open the HTTPS link in Chrome or Edge.
2. Ask them to try mobile hotspot once. If it opens on hotspot but not office LAN, the office network is blocking Vercel.
3. Ask IT/network team to allow:
   - `https://indane-sales-monitoring.vercel.app`
   - `https://*.vercel.app`

## If Public Site Opens But Looks Old

The local code must be pushed to GitHub and Vercel must redeploy.

After pushing to GitHub:

1. Open Vercel dashboard.
2. Select project `indane-sales-monitoring`.
3. Open `Deployments`.
4. Click `Redeploy` on the latest deployment, or wait for automatic deployment after GitHub push.
5. Open the link with a cache-busting suffix:

```text
https://indane-sales-monitoring.vercel.app/?v=latest
```

## Important Data Sync Limitation

The current Vercel portal is a static browser portal. Excel uploads and dashboard data are stored in the browser's local storage. That means:

- Data uploaded on Mukesh Kumar PC is visible on that same browser.
- Seniors opening the Vercel link from another PC will not automatically receive that uploaded data.
- For live common data across all users, the portal must be connected to an online backend database.

## Required For True Multi-User Live Portal

Deploy the included FastAPI backend with PostgreSQL, then connect the public frontend to it.

Recommended low-cost/free setup:

1. PostgreSQL database: Neon, Supabase, or Render PostgreSQL.
2. Backend: Render Web Service using the included FastAPI app.
3. Frontend: Vercel or Render static site.
4. Environment variables:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `PUBLIC_BASE_URL`
   - SMTP settings for email reports.

Only after this backend database is live will all IDO, Plant, UPSO-II, and viewer users see the same uploaded data and live dashboard updates from different PCs.
