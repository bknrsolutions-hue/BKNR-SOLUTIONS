import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# -----------------------------------------------------
# 🟢 Load environment variables from .env (if exists)
# -----------------------------------------------------
load_dotenv()

# -----------------------------------------------------
# 🟣 Database URL — PostgreSQL Connection String
# -----------------------------------------------------
# Format: postgresql+psycopg2://USER:PASSWORD@HOST:PORT/DB_NAME
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:143211Nr@localhost:5432/bknr_erp"
)

# -----------------------------------------------------
# 🟡 Create SQLAlchemy Engine
# -----------------------------------------------------
# echo=True enables SQL logging in console (optional)
engine = create_engine(
    DATABASE_URL,
    pool_size=10,          # concurrent connections
    max_overflow=5,        # extra overflow connections
    pool_timeout=30,       # seconds to wait before timeout
    pool_pre_ping=True     # auto reconnect if DB disconnects
)

# -----------------------------------------------------
# 🟠 Create Session Factory
# -----------------------------------------------------
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# -----------------------------------------------------
# 🔵 Base Class for All ORM Models
# -----------------------------------------------------
Base = declarative_base()

# -----------------------------------------------------
# 🧩 Dependency - Get DB Session for FastAPI routes
# -----------------------------------------------------
def get_db():
    """Provide a SQLAlchemy session to routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
