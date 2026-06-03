# INDANE SALES MONITORING

Local and deployable web portal for UPSO-II domestic LPG SPD planning, plant execution, live dashboards, exception tracking, distributor maintenance, report download, and profile management.

## Run Locally

Preferred real local HTTP portal:

```text
RUN_PORTAL_HTTP.cmd
```

It opens:

```text
http://127.0.0.1:8095
```

Keep the black server window open.

Offline fallback, if HTTP is blocked:

```text
INDANE_SALES_MONITORING_PORTAL.html
```

Open on Android phone on the same Wi-Fi after Windows Firewall allows TCP `8095`:

```text
http://192.168.31.30:8095
```

## Default Users

Password for all starter users:

```text
Indane@12345
```

Core users:

- `admin`
- `upso2`
- `ido_noida`
- `ido_dehradun`
- `plant_loni`
- `plant_aligarh`
- `plant_haridwar`
- `plant_kashipur`
- `plant_karnal`
- `lsa_01` onwards, generated from the LSA names in `Indent planning-26.05.26.xlsx`

## Implemented Workflow

- UPSO-II/Admin can view all dashboards, maintain profiles, and manage planning control.
- IDO and LSA users can create distributor-wise SPD in truck loads, add indent numbers, mark priority, add backlog, and maintain distributor profiles.
- Plant users see only approved SPD distributors for their plant and enter invoiced loads, SAP indent availability, fund shortage, and other issues.
- Non-availability of SAP indent creates alert banners until corrected or the row is invoiced.
- Reports can be downloaded from **Download Day Report** as day-wise SPD vs dispatch CSV.
- `data/seed-distributors.json` is generated from `Indent planning-26.05.26.xlsx` and currently seeds the distributors from that workbook.

## Production Deployment

The full production stack is included:

- FastAPI backend in `app/`
- PostgreSQL schema in `schema.sql`
- Dockerfile and `docker-compose.yml`
- Render blueprint in `render.yaml`

For a public domain, deploy the project to a cloud host, set `PUBLIC_BASE_URL`, configure SMTP, and put the service behind HTTPS.

## Core Business Rules

- Plant execution is blocked unless the distributor has an approved SPD for the execution date.
- All MT/KG to cylinder calculations use ceiling rounding.
- 1 domestic cylinder = 14.2 kg = 0.0142 MT.
- 1 truck load = 360 cylinders = 5.112 MT.
- Working days exclude Sundays and configured holidays.
- Backlog uploads elevate distributor priority and can bypass baseline tolerance caps.
