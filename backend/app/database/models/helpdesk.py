from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_number = Column(String(50), unique=True, index=True)  # Example: TKT-2026-001
    user_email = Column(String(100), index=True)
    company_id = Column(String(50), index=True)
    subject = Column(String(255))
    status = Column(String(50), default="OPEN")  # OPEN, IN_PROGRESS, RESOLVED
    created_at = Column(DateTime, default=datetime.now)

    # Relationship to fetch messages inside this ticket
    messages = relationship("TicketMessage", back_populates="ticket", cascade="all, delete-orphan")

class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("support_tickets.id", ondelete="CASCADE"))
    sender_email = Column(String(100))
    sender_type = Column(String(20))  # "USER" or "ADMIN" / "SUPPORT"
    message = Column(Text)
    sent_at = Column(DateTime, default=datetime.now)

    ticket = relationship("SupportTicket", back_populates="messages")