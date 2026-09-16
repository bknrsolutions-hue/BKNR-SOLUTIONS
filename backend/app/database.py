import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

_IS_PRODUCTION = os.environ.get("ENVIRONMENT", "development").strip().lower() == "production"
_ENV = os.environ.get("ENVIRONMENT", "development").strip().lower()
_NEEDS_SSL = _ENV not in ("development", "test", "dev")

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("❌ DATABASE_URL not set")

# Fix old postgres:// issue
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgres://",
        "postgresql://",
        1
    )

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=10,
    connect_args={"sslmode": "require"} if _NEEDS_SSL else {}
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
