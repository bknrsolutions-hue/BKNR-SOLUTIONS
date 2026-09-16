import threading
import time

import pytest

from app.database.models.enterprise_finance import VoucherHeader


def post_entry(client, payload, results, idx):
    resp = client.post("/attendance/entry", json=payload)
    results[idx] = resp


@pytest.mark.usefixtures("clean_database")
def test_two_simultaneous_in_requests(client, tenants, login_as, db_session):
    tenant_a, _ = tenants
    login_as(tenant_a)

    # create an employee
    emp = db_session.execute(
        "INSERT INTO employee_registration (employee_id, employee_name, company_id, status, created_at) VALUES ('E001', 'Test Emp', :company, 'ACTIVE', now()) RETURNING id",
        {"company": tenant_a.company.company_code},
    ).fetchone()
    db_session.commit()

    payload = {"employee_id": "E001", "action": "IN", "shift_name": "GENERAL"}

    results = [None, None]
    t1 = threading.Thread(target=post_entry, args=(client, payload, results, 0))
    t2 = threading.Thread(target=post_entry, args=(client, payload, results, 1))

    t1.start(); t2.start()
    t1.join(); t2.join()

    statuses = [r.status_code for r in results]
    assert any(s == 200 for s in statuses)


@pytest.mark.usefixtures("clean_database")
def test_two_simultaneous_exit_requests_create_single_voucher(client, tenants, login_as, db_session):
    tenant_a, _ = tenants
    login_as(tenant_a)

    # seed employee (contractor)
    db_session.execute(
        "INSERT INTO employee_registration (employee_id, employee_name, company_id, status, employee_type, contractor_name, current_salary, created_at) VALUES ('C001', 'Contractor', :company, 'ACTIVE', 'CONTRACT', 'ACME', 26000, now())",
        {"company": tenant_a.company.company_code},
    )
    db_session.flush()

    # create an open duty
    db_session.execute(
        '''INSERT INTO daily_attendance (company_id, employee_id, employee_name, duty_date, first_in, movements, status, duty_status, created_at) 
        VALUES (:company, 'C001', 'Contractor', now()::date, now() - interval '9 hours', '[{"type":"IN","time":"00:00","date":"1970-01-01"}]'::jsonb, 'OPEN', 'OPEN', now()) RETURNING id''',
        {"company": tenant_a.company.company_code},
    )
    duty_row = db_session.execute("SELECT id FROM daily_attendance WHERE employee_id='C001' AND company_id=:company", {"company": tenant_a.company.company_code}).fetchone()
    db_session.commit()
    duty_id = duty_row[0]

    payload = {"employee_id": "C001", "action": "EXIT", "shift_name": "GENERAL"}

    results = [None, None]
    t1 = threading.Thread(target=post_entry, args=(client, payload, results, 0))
    t2 = threading.Thread(target=post_entry, args=(client, payload, results, 1))

    t1.start(); time.sleep(0.05); t2.start()
    t1.join(); t2.join()

    # check vouchers for ATT-{duty.id}
    vouchers = db_session.query(VoucherHeader).filter(VoucherHeader.company_id == tenant_a.company.company_code, VoucherHeader.reference_no == f"ATT-{duty_id}").all()
    # Test currently expects single voucher (if idempotency exists). If duplicates are present, test will fail.
    assert len(vouchers) <= 1, f"Duplicate vouchers found: {len(vouchers)}"


@pytest.mark.usefixtures("clean_database")
def test_salary_advance_sync_double_execution(db_session):
    # This test calls the service directly to verify unique constraint handling
    from app.services.salary_advance_recovery import sync_monthly_advance_recovery
    from app.database.models.attendance import EmployeeSalaryAdvance

    company = "TST"
    employee = "EADV"

    # create an advance row
    db_session.execute(
        "INSERT INTO employee_salary_advance (company_id, employee_id, advance_date, advance_amount, monthly_deduction, status, created_at) VALUES (:c, :e, now()::date, 1000, 500, 'APPROVED', now()) RETURNING id",
        {"c": company, "e": employee},
    )
    adv = db_session.execute("SELECT id FROM employee_salary_advance WHERE company_id=:c", {"c": company}).fetchone()
    db_session.commit()
    adv_id = adv[0]

    # run two syncs concurrently to simulate race
    def run_sync(results, idx):
        s = db_session
        try:
            val = sync_monthly_advance_recovery(s, company, employee, "2026-09", 1, True)
            s.commit()
            results[idx] = (True, val)
        except Exception as e:
            s.rollback()
            results[idx] = (False, str(e))

    results = [None, None]
    t1 = threading.Thread(target=run_sync, args=(results, 0))
    t2 = threading.Thread(target=run_sync, args=(results, 1))
    t1.start(); t2.start()
    t1.join(); t2.join()

    # If service is not handling concurrency correctly, one thread may raise IntegrityError
    assert any(r[0] is True for r in results), f"Both syncs failed: {results}"
