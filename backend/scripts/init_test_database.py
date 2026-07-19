"""Create the current SVBK schema only in an explicitly named test database."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.conftest import TEST_DATABASE_URL, assert_safe_test_database


def main() -> None:
    assert_safe_test_database(TEST_DATABASE_URL)
    from app.database import Base, engine

    import app.database.models.advanced_seafood_erp
    import app.database.models.assets
    import app.database.models.attendance
    import app.database.models.bills
    import app.database.models.criteria
    import app.database.models.enterprise_finance
    import app.database.models.feature_flags
    import app.database.models.general_stock
    import app.database.models.gst_models
    import app.database.models.helpdesk
    import app.database.models.inventory_management
    import app.database.models.invoices
    import app.database.models.payments
    import app.database.models.processing
    import app.database.models.requirements
    import app.database.models.system_settings
    import app.database.models.users

    Base.metadata.create_all(bind=engine)
    print(f"SVBK isolated test schema is ready ({len(Base.metadata.tables)} tables).")


if __name__ == "__main__":
    main()
