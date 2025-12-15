import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./test.db"
)

engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()



# ---------------- DB DEPENDENCY -------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------- TABLE CREATOR -------------
def create_tables():
    # Import all models (MANDATORY)
    from app.database.models.auth import Company, User, OTPTable
    Base.metadata.create_all(bind=engine)
    print("✔ Tables Created Successfully")
