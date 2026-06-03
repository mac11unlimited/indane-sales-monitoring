# Public Link Setup

This project is ready for public HTTPS deployment, but a public link can only be generated inside a hosting account.

## Fastest Option: Render

1. Upload this folder to a private GitHub repository.
2. Open Render and choose **New > Blueprint**.
3. Select the repository containing this folder.
4. Render will read `render.yaml`, create:
   - `indane-sales-monitoring` web service
   - `indane-sales-db` PostgreSQL database
5. After deployment, Render provides a public URL like:

```text
https://indane-sales-monitoring.onrender.com
```

6. Set `PUBLIC_BASE_URL` to that Render URL.
7. Add SMTP settings if email alerts and password recovery must send real mail.

## Login From Android / Microsoft Edge / Any Browser

Open the Render URL in any browser. The login page is public, but the portal data remains role protected.

Default first-login users are listed in `README.md`. Change default passwords immediately after deployment.

## Custom Domain

In Render, open the web service, go to **Settings > Custom Domains**, add the domain, and update DNS as Render instructs. Example:

```text
https://indane-sales-monitoring.your-domain.com
```
