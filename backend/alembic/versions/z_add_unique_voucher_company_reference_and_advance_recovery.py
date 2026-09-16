"""add unique voucher reference and create advance recovery table

Revision ID: 9f3c1a7b2d40
Revises: e4a1c7d29b10
Create Date: 2026-09-16
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '9f3c1a7b2d40'
down_revision = 'e4a1c7d29b10'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create unique index for company_id + reference_no to enforce idempotent voucher references
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_voucher_company_reference ON voucher_headers (company_id, reference_no)")

    # Create employee_salary_advance_recovery table if not exists (legacy runtime DDL moved to migration)
    op.execute('''
    CREATE TABLE IF NOT EXISTS employee_salary_advance_recovery (
        id SERIAL PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        employee_id VARCHAR(50) NOT NULL,
        advance_id INTEGER NOT NULL,
        salary_processing_id INTEGER,
        month_year VARCHAR(7) NOT NULL,
        amount DOUBLE PRECISION DEFAULT 0 NOT NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,
        recovered_at TIMESTAMP,
        reversed_at TIMESTAMP
    )
    ''' )
    op.execute('CREATE INDEX IF NOT EXISTS ix_advance_recovery_employee ON employee_salary_advance_recovery (company_id, employee_id, month_year)')

    # Create a UNIQUE index for (company_id, advance_id, month_year) so concurrent
    # inserts raise IntegrityError and can be handled with savepoints by the application.
    op.execute('''
    CREATE UNIQUE INDEX IF NOT EXISTS ux_advance_recovery_company_advance_month
    ON employee_salary_advance_recovery (company_id, advance_id, month_year)
    ''')


def downgrade() -> None:
    # Downgrade: drop the unique index and the created table/index
    op.execute('DROP INDEX IF EXISTS ux_voucher_company_reference')
    # Drop the unique index first, then the auxiliary index and table
    op.execute('DROP INDEX IF EXISTS ux_advance_recovery_company_advance_month')
    op.execute('DROP INDEX IF EXISTS ix_advance_recovery_employee')
    op.execute('DROP TABLE IF EXISTS employee_salary_advance_recovery')
