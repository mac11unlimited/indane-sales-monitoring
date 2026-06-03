# Deployment

## Docker

```bash
docker compose up --build -d
```

Open `http://127.0.0.1:8095`.

For a public domain, place the `web` service behind a TLS reverse proxy and set:

- `PUBLIC_BASE_URL=https://your-domain`
- `SECRET_KEY` to a long random value
- SMTP settings for password recovery, two-hour exceptions, and four-hour reports
- PostgreSQL credentials managed through deployment secrets

## Data Flow

1. IDO/Admin uploads `Indent planning` for the operating date.
2. Plant users see only same-day distributors mapped to their plant.
3. Plant execution POSTs are rejected unless an approved `daily_spd` row exists.
4. MCSI uploads feed `mcsi_sales` for strategic trend and conversion reporting.
5. Background jobs run every two hours, four hours, and at day close.
