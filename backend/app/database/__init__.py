import os
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
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

database_host = (make_url(DATABASE_URL).host or "").lower()
is_render_database = "render.com" in database_host or os.getenv("RENDER") == "true"

connect_args = {}
if is_render_database:
    # Render's external PostgreSQL endpoint requires TLS. TCP keepalives help
    # stale cross-region connections fail fast so pool_pre_ping can replace them.
    connect_args = {
        "sslmode": os.getenv("PGSSLMODE", "require"),
        "connect_timeout": int(os.getenv("DB_CONNECT_TIMEOUT", "10")),
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
        "application_name": os.getenv("RENDER_SERVICE_NAME", "bknr_erp"),
    }

# -----------------------------------------------------
# 🟡 Create SQLAlchemy Engine
# -----------------------------------------------------
engine = create_engine(
    DATABASE_URL,
    pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "5")),
    pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "15")),
    pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "300")),
    pool_pre_ping=True,
    pool_use_lifo=True,
    connect_args=connect_args,
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
