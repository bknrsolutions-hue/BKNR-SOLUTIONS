-- Additive-only staging schema reconciliation.
-- Safe to re-run: no existing data, columns, or legacy tables are removed.
-- Prefer `alembic upgrade head`; this file is provided for controlled manual
-- recovery when an old staging database cannot yet advance its Alembic stamp.

BEGIN;

ALTER TABLE IF EXISTS kg_basis_workers
    ADD COLUMN IF NOT EXISTS worker_type VARCHAR(100)
        DEFAULT 'KG Basis Company Worker',
    ADD COLUMN IF NOT EXISTS worker_category VARCHAR(50),
    ADD COLUMN IF NOT EXISTS daily_salary DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS account_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE IF EXISTS de_heading
    ADD COLUMN IF NOT EXISTS table_no VARCHAR(50);

ALTER TABLE IF EXISTS production_requirements
    ADD COLUMN IF NOT EXISTS date DATE,
    ADD COLUMN IF NOT EXISTS time VARCHAR(50),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE IF EXISTS raw_material_purchasing
    ADD COLUMN IF NOT EXISTS g1_expr VARCHAR(500),
    ADD COLUMN IF NOT EXISTS g2_expr VARCHAR(500),
    ADD COLUMN IF NOT EXISTS dc_expr VARCHAR(500);

ALTER TABLE IF EXISTS de_heading
    ADD COLUMN IF NOT EXISTS hlso_qty_expr VARCHAR(500);

ALTER TABLE IF EXISTS grading
    ADD COLUMN IF NOT EXISTS quantity_expr VARCHAR(500);

ALTER TABLE IF EXISTS peeling
    ADD COLUMN IF NOT EXISTS peeled_qty_expr VARCHAR(500);

CREATE INDEX IF NOT EXISTS ix_de_heading_table_no
    ON de_heading (table_no);
CREATE INDEX IF NOT EXISTS ix_production_requirements_company_id
    ON production_requirements (company_id);
CREATE INDEX IF NOT EXISTS ix_production_requirements_id
    ON production_requirements (id);
CREATE INDEX IF NOT EXISTS ix_production_requirements_po_number
    ON production_requirements (po_number);

COMMIT;
