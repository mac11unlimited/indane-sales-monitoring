# Render Deployment Steps - INDANE SALES MONITORING

Use these steps to publish the portal on Render without sharing your password in chat.

## 1. Prepare Code

Upload this project folder to a private GitHub repository:

```text
indane-sales-monitoring
```

Render can deploy directly from GitHub.

## 2. Create Render Blueprint

1. Open Render dashboard.
2. Select **New +**.
3. Select **Blueprint**.
4. Connect the GitHub repository containing this folder.
5. Render will detect `render.yaml`.
6. Confirm creation of:
   - Web service: `indane-sales-monitoring`
   - PostgreSQL database: `indane-sales-db`

## 3. Environment Variables

Render will auto-generate:

```text
SECRET_KEY
DATABASE_URL
```

Set these manually after the first public URL is available:

```text
PUBLIC_BASE_URL=https://your-render-service-url.onrender.com
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=
```

For Gmail SMTP, use a Gmail App Password, not your normal Gmail password.

## 4. Default Login

```text
User: admin
Password: Indane@12345
```

Change the default password after first deployment.

## 5. Domain

After the Render service is working:

1. Open service settings.
2. Go to **Custom Domains**.
3. Add your domain/subdomain.
4. Update DNS as shown by Render.
5. Render will issue HTTPS automatically after DNS propagation.

## 6. Current Deployment Behavior

The Docker service runs:

```text
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8095}
```

The app serves the latest local portal file:

```text
INDANE_SALES_MONITORING_PORTAL.html
```

