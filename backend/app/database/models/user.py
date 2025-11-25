from sqlalchemy import Column, Integer, String
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    company_name = Column(String(255), nullable=False)
    company_id = Column(String(50), unique=True, nullable=False)
    designation = Column(String(100))
    phone = Column(String(50))
    password = Column(String(255), nullable=False)
    role = Column(String(50), default="User")   # ✅ add this line
