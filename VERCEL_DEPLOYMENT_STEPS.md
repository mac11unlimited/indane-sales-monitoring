# INDANE SALES MONITORING - Vercel Deployment

This folder is prepared for Vercel static hosting.

## Files Required By Vercel

- `index.html` is the web entry page.
- `static/` contains images/assets used by the portal.
- `vercel.json` contains static hosting settings.

## Deploy Steps

1. Open GitHub Desktop or GitHub web upload.
2. Commit and push this repository:
   `iocl_project/indane-sales-monitoring`
3. Open https://vercel.com/
4. Sign in with GitHub.
5. Click `Add New` -> `Project`.
6. Import the GitHub repository named `indane-sales-monitoring`.
7. Framework Preset: select `Other`.
8. Build Command: leave blank.
9. Output Directory: leave blank.
10. Install Command: leave blank.
11. Click `Deploy`.

## Current Limitation

This Vercel deployment is a static web portal version. It is good for online access and demonstration. Shared central database, real email automation, SMS, and server-side scheduled jobs require a backend deployment such as FastAPI + PostgreSQL on Render/Railway/Azure or Vercel serverless functions.
