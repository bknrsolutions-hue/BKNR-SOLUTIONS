import sys
import os
sys.path.append(os.path.abspath('.'))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def run_test(name, url):
    print(f"Testing {name} ({url})...")
    with client as c:
        with c.session_transaction() as sess:
            sess["email"] = "bknr.solutions@gmail.com"
            sess["company_code"] = "1"
            sess["role"] = "admin"
            sess["permissions"] = "ALL"

        response = c.get(url)
        print("STATUS CODE:", response.status_code)
        print("CONTENT TYPE:", response.headers.get("content-type"))
        if response.status_code == 500:
            print("ERROR BODY:\n", response.text[:1000])
        print("------------------------------------------\n")

run_test("Gate Entry Report", "/reports/gate_entry?format=json")
run_test("RM Purchasing Report", "/reports/raw_material_purchasing?format=json")
run_test("De-Heading Report", "/reports/de_heading?format=json")
run_test("Grading Report", "/reports/grading_report?format=json")
run_test("Peeling Report", "/reports/peeling_report?format=json")
run_test("Soaking Report", "/reports/soaking_report?format=json")
run_test("Production Report", "/reports/production_report?format=json")
run_test("Reprocess Report", "/reports/re-process?format=json")
