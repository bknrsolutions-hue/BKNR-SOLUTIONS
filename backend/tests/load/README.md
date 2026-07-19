# BKNR ERP Load Testing

Locust setup for FastAPI + HTML + PostgreSQL SaaS ERP load tests.

## Install

```bash
pip install -r backend/tests/load/requirements-load.txt
```

## Run local server

```bash
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Run Locust UI

```bash
cd backend/tests/load
locust -f locustfile.py --host http://127.0.0.1:8000
```

Open:

```text
http://localhost:8089
```

Suggested stages:

```text
50 users, spawn 5/sec
100 users, spawn 10/sec
250 users, spawn 25/sec
500 users, spawn 50/sec
1000 users, spawn 100/sec
```

## Authenticated ERP test

Set a test user before running Locust:

```bash
export BKNR_LOAD_COMPANY_ID="YOUR_COMPANY_ID"
export BKNR_LOAD_EMAIL="user@example.com"
export BKNR_LOAD_PASSWORD="password"
export BKNR_LOAD_OTP="current synthetic test OTP"
locust -f locustfile.py --host http://127.0.0.1:8000
```

Without these env vars, the test only hits public/login/health endpoints. Use a
synthetic staging account. The OTP is required because the real login contract
is preserved; the load test does not bypass authentication.

## Headless quick test

```bash
locust -f locustfile.py \
  --host http://127.0.0.1:8000 \
  --headless \
  -u 100 \
  -r 10 \
  --run-time 2m \
  --csv reports/bknr_100_users
```

## Render/deployed test

```bash
locust -f locustfile.py --host https://yourerp.onrender.com
```

Standard profiles (each writes CSV files with request count, RPS, average,
p95/p99 and failure rate):

```bash
locust -f locustfile.py --host "$SVBK_PERF_BASE_URL" --headless -u 10  -r 2  -t 2m --csv reports/svbk_10
locust -f locustfile.py --host "$SVBK_PERF_BASE_URL" --headless -u 50  -r 5  -t 5m --csv reports/svbk_50
locust -f locustfile.py --host "$SVBK_PERF_BASE_URL" --headless -u 100 -r 10 -t 8m --csv reports/svbk_100
locust -f locustfile.py --host "$SVBK_PERF_BASE_URL" --headless -u 500 -r 25 -t 15m --csv reports/svbk_500
```

The 500-user profile is never part of normal CI. Run it only against an
explicitly approved staging/performance environment.

## Heavy download endpoints

Report exports can be expensive. They are disabled by default. Enable them only after normal page/API tests are stable:

```bash
locust -f locustfile.py --host http://127.0.0.1:8000 --bknr-downloads
```

or:

```bash
export BKNR_LOAD_DOWNLOADS=1
```

## What this scenario covers

- Login session
- Dashboard pages
- Processing pages
- Inventory pages
- Finance pages
- Reports pages
- Search/notifications APIs
- Optional Excel/template exports

Avoid running destructive entry-save/import/delete tests against production data.
