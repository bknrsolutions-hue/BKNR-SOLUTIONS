import logging
from sqlalchemy import text
from app.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

def migrate():
    logger.info("Starting migration to add ui_colors column to users table...")
    try:
        with engine.connect() as conn:
            # PostgreSQL command to add columns if not exists
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_colors TEXT;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS current_session_id VARCHAR;"))
            conn.commit()
            logger.info("Columns ui_colors and current_session_id added successfully (or already existed).")
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise e

if __name__ == "__main__":
    migrate()
