import os
import random

from locust import HttpUser, between, events, task


COMPANY_ID = os.getenv("BKNR_LOAD_COMPANY_ID", "").strip()
EMAIL = os.getenv("BKNR_LOAD_EMAIL", "").strip()
PASSWORD = os.getenv("BKNR_LOAD_PASSWORD", "").strip()
ENABLE_DOWNLOADS = os.getenv("BKNR_LOAD_DOWNLOADS", "0").strip().lower() in {"1", "true", "yes"}


def has_login_credentials():
    return bool(COMPANY_ID and EMAIL and PASSWORD)


@events.init_command_line_parser.add_listener
def add_custom_arguments(parser):
    parser.add_argument(
        "--bknr-downloads",
        action="store_true",
        default=False,
        help="Also hit heavier report export/download endpoints.",
    )


class BKNRERPUser(HttpUser):
    wait_time = between(1, 4)

    read_pages = (
        "/home",
        "/dashboard/processing_dashboard",
        "/dashboard/inventory_dashboard",
        "/dashboard/finance_dashboard",
        "/dashboard/costing_dashboard",
        "/processing/gate_entry",
        "/processing/raw_material_purchasing",
        "/processing/production",
        "/inventory/stock_report",
        "/inventory/stock_entry",
        "/reports/gate_entry",
        "/reports/raw_material_purchasing",
        "/reports/production_report",
        "/reports/grading_report",
        "/summary/processing",
        "/summary/periodic-report",
        "/finance_accounts/ledger_master/entry",
        "/finance_accounts/journal_entry/entry",
        "/general_stock/entry",
        "/export_documents/dashboard",
    )

    api_reads = (
        "/auth/session-info",
        "/auth/masters-check",
        "/menu/notifications",
        "/menu/search_entities?q=stock",
        "/menu/search_entities?q=report",
        "/data-management/history",
    )

    downloads = (
        "/reports/gate_entry/export_excel",
        "/reports/production_report/export_xlsx",
        "/data-management/template/blank",
        "/data-management/template/master",
        "/export_documents/registers.xlsx",
    )

    def on_start(self):
        self.logged_in = False
        self.client.get("/health", name="GET /health")

        if not has_login_credentials():
            self.client.get("/", name="GET / login page")
            return

        with self.client.post(
            "/auth/login",
            json={
                "company_id": COMPANY_ID,
                "email": EMAIL,
                "password": PASSWORD,
            },
            name="POST /auth/login",
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                self.logged_in = True
            else:
                response.failure(f"login failed: {response.status_code} {response.text[:160]}")

    @task(18)
    def browse_authenticated_pages(self):
        if not self.logged_in:
            self.client.get("/", name="GET / login page")
            return

        path = random.choice(self.read_pages)
        self.client.get(path, name=f"GET {path}")

    @task(8)
    def read_small_apis(self):
        if not self.logged_in:
            self.client.get("/health", name="GET /health")
            return

        path = random.choice(self.api_reads)
        self.client.get(path, name=f"GET {path}")

    @task(4)
    def dashboard_burst(self):
        if not self.logged_in:
            self.client.get("/", name="GET / login page")
            return

        for path in (
            "/dashboard/processing_dashboard",
            "/dashboard/inventory_dashboard",
            "/dashboard/finance_dashboard",
        ):
            self.client.get(path, name=f"GET {path}")

    @task(1)
    def optional_downloads(self):
        enabled = ENABLE_DOWNLOADS or getattr(self.environment.parsed_options, "bknr_downloads", False)
        if not self.logged_in or not enabled:
            return

        path = random.choice(self.downloads)
        self.client.get(path, name=f"GET {path}")
