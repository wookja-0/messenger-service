from sqlalchemy import create_engine, Column, String, DateTime, Text, Integer, ForeignKey, Boolean, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://messenger_user:messenger_pass@localhost:5432/messenger")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    profile_image_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Relationships
    created_rooms = relationship("Room", back_populates="creator", foreign_keys="Room.creator_id")
    room_memberships = relationship("RoomUser", back_populates="user")


class Room(Base):
    __tablename__ = "rooms"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    creator_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_private = Column(Boolean, default=False, nullable=False)
    
    # Relationships
    creator = relationship("User", back_populates="created_rooms", foreign_keys=[creator_id])
    members = relationship("RoomUser", back_populates="room", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="room", cascade="all, delete-orphan")


class RoomUser(Base):
    __tablename__ = "room_users"

    id = Column(String, primary_key=True)
    room_id = Column(String, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    last_read_at = Column(DateTime, nullable=True)  # 마지막으로 읽은 메시지 시간
    
    # Relationships
    room = relationship("Room", back_populates="members")
    user = relationship("User", back_populates="room_memberships")
    
    __table_args__ = (
        {'extend_existing': True}
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True)
    room_id = Column(String, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username = Column(String, nullable=False)  # 캐시용
    text = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    socket_id = Column(String)
    file_info = Column(JSON, nullable=True)  # 파일 정보 저장 (JSON 형식)
    
    # Relationships
    room = relationship("Room", back_populates="messages")
    user = relationship("User")


class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(String, primary_key=True)
    room_id = Column(String, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    inviter_id = Column(String, ForeignKey("users.id"), nullable=False)
    invitee_email = Column(String, nullable=False)
    status = Column(String, default="pending", nullable=False)  # pending, accepted, rejected
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)


def init_db():
    """데이터베이스 테이블 생성"""
    Base.metadata.create_all(bind=engine)


def get_db():
    """데이터베이스 세션 생성"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
