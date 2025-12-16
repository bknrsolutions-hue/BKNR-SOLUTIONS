import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# =================================================
# DATABASE URL (RENDER / PROD ONLY)
# =================================================
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("❌ DATABASE_URL not set")

# =================================================
# SQLALCHEMY ENGINE
# =================================================
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
    future=True
)

# =================================================
# SESSION
# =================================================
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# =================================================
# BASE
# =================================================
Base = declarative_base()

# =================================================
# DB DEPENDENCY
# =================================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
