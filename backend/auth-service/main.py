from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid
import bcrypt
from jose import jwt
from datetime import datetime, timedelta
import sys
import os

# 공통 데이터베이스 모델 경로 추가
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from shared.database import init_db, get_db, User, Room, RoomUser
from shared.redis_client import cache_hash_get, cache_hash_set, cache_hash_get_all, cache_delete_pattern
from shared.cache import invalidate_user_cache
import time

app = FastAPI(title="Auth Service", version="1.0.0")

# JWT 설정
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # 30분

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# 데이터베이스 초기화
def init_database_with_retry(max_retries=5, delay=2):
    for i in range(max_retries):
        try:
            init_db()
            print("데이터베이스 초기화 성공")
            return
        except Exception as e:
            if i < max_retries - 1:
                print(f"데이터베이스 연결 실패, {delay}초 후 재시도... ({i+1}/{max_retries})")
                time.sleep(delay)
            else:
                print(f"데이터베이스 초기화 실패: {e}")
                raise

init_database_with_retry()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic 모델
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class UserUpdate(BaseModel):
    username: Optional[str] = None
    profile_image_url: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# 유틸리티 함수
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증 정보를 확인할 수 없습니다",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except Exception:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user


# API 엔드포인트
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "auth-service"}


@app.post("/api/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """회원가입"""
    # 이메일 중복 확인
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 등록된 이메일입니다"
        )
    
    # 사용자 생성
    user_id = str(uuid.uuid4())
    hashed_password = hash_password(user_data.password)
    
    user = User(
        id=user_id,
        email=user_data.email,
        username=user_data.username,
        password_hash=hashed_password
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # 기본 채팅방에 자동 추가 (관리자 제외)
    try:
        # 관리자 계정은 기본 채팅방에 추가하지 않음
        if user.email == "admin@admin.com":
            print(f"[REGISTER] 관리자 계정은 기본 채팅방에 추가하지 않음")
        else:
            general_room = db.query(Room).filter(Room.name == "오픈채팅방").first()
            if general_room:
                # 이미 멤버인지 확인
                existing_member = db.query(RoomUser).filter(
                    RoomUser.room_id == general_room.id,
                    RoomUser.user_id == user_id
                ).first()
                
                if not existing_member:
                    room_user = RoomUser(
                        id=str(uuid.uuid4()),
                        room_id=general_room.id,
                        user_id=user_id,
                        is_admin=False
                    )
                    db.add(room_user)
                    db.commit()
                    print(f"[REGISTER] 사용자 {user_id}를 기본 채팅방에 추가 완료")
    except Exception as e:
        print(f"[REGISTER] 기본 채팅방 추가 중 오류 (무시): {e}")
        # 오류가 발생해도 회원가입은 성공으로 처리
        db.rollback()
    
    return user


@app.post("/token", response_model=Token)
async def login_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """로그인 (OAuth2 토큰 엔드포인트) - 관리자 계정 차단"""
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 관리자 계정은 일반 로그인 차단
    if user.email == "admin@admin.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 계정은 관리자 페이지에서 로그인해주세요"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="비활성화된 계정입니다"
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@app.post("/api/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """로그인 (API 엔드포인트) - 관리자 계정 차단"""
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 관리자 계정은 일반 로그인 차단
    if user.email == "admin@admin.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 계정은 관리자 페이지에서 로그인해주세요"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="비활성화된 계정입니다"
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@app.get("/api/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """현재 사용자 정보 조회 (Redis 캐싱)"""
    cache_key = f"cache:user:{current_user.id}"
    
    # 캐시에서 조회
    cached_user = cache_hash_get_all(cache_key)
    if cached_user:
        return UserResponse(**cached_user)
    
    # 캐시 미스 - DB에서 조회 후 캐싱
    user_data = {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "profile_image_url": current_user.profile_image_url,
        "created_at": current_user.created_at
    }
    
    # Hash로 저장
    for field, value in user_data.items():
        cache_hash_set(cache_key, field, value, ttl=600)
    
    return current_user


@app.put("/api/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """현재 사용자 정보 수정"""
    if user_update.username:
        current_user.username = user_update.username
    if user_update.profile_image_url is not None:
        current_user.profile_image_url = user_update.profile_image_url
    
    db.commit()
    db.refresh(current_user)
    
    # 사용자 정보 수정 시 캐시 무효화
    invalidate_user_cache(current_user.id)
    
    return current_user


@app.post("/api/me/change-password")
async def change_password(
    password_change: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """비밀번호 변경"""
    # 현재 비밀번호 확인
    if not verify_password(password_change.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="현재 비밀번호가 올바르지 않습니다"
        )
    
    # 새 비밀번호 검증
    if len(password_change.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="새 비밀번호는 6자 이상이어야 합니다"
        )
    
    # 비밀번호 변경
    current_user.password_hash = hash_password(password_change.new_password)
    db.commit()
    
    # 비밀번호 변경 시 캐시 무효화 (보안상)
    invalidate_user_cache(current_user.id)
    
    return {"message": "비밀번호가 성공적으로 변경되었습니다"}


@app.get("/api/users/search")
async def search_users(
    query: str = "",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50
):
    """사용자 검색 (초대용) - query가 비어있으면 전체 사용자 목록 반환 (Redis 캐싱)"""
    # 캐시 키 생성 (검색어 포함)
    cache_key = f"cache:users:search:{query}:{limit}"
    
    # 캐시에서 조회
    from shared.redis_client import cache_get, cache_set
    cached_result = cache_get(cache_key)
    if cached_result is not None:
        return cached_result
    
    query_filter = db.query(User).filter(
        User.id != current_user.id,
        User.is_active == True,
        User.email != ADMIN_EMAIL  # 관리자 계정 제외
    )
    
    # 검색어가 있으면 필터링, 없으면 전체 목록
    if query and query.strip():
        query_filter = query_filter.filter(
            User.email.contains(query.strip()) | User.username.contains(query.strip())
        )
    
    users = query_filter.limit(limit).all()
    
    result = [
        {
            "id": user.id,
            "email": user.email,
            "username": user.username
        }
        for user in users
    ]
    
    # 결과를 캐시에 저장 (TTL: 5분)
    cache_set(cache_key, result, ttl=300)
    
    return result


# 관리자 관련 API
ADMIN_EMAIL = "admin@admin.com"
ADMIN_PASSWORD = "adminadmin"


def is_admin_user(user: User) -> bool:
    """관리자 여부 확인"""
    return user.email == ADMIN_EMAIL


def verify_admin(current_user: User = Depends(get_current_user)):
    """관리자 권한 확인"""
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다"
        )
    return current_user


@app.post("/api/admin/login", response_model=Token)
async def admin_login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """관리자 로그인"""
    if form_data.username != ADMIN_EMAIL or form_data.password != ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="관리자 이메일 또는 비밀번호가 올바르지 않습니다",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 관리자 계정이 없으면 생성
    admin_user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if not admin_user:
        admin_id = str(uuid.uuid4())
        hashed_password = hash_password(ADMIN_PASSWORD)
        admin_user = User(
            id=admin_id,
            email=ADMIN_EMAIL,
            username="관리자",
            password_hash=hashed_password,
            is_active=True
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": admin_user.id}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": admin_user
    }


@app.get("/api/admin/users")
async def get_all_users(
    admin_user: User = Depends(verify_admin),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """전체 사용자 목록 조회 (관리자 전용)"""
    from shared.database import Room, RoomUser, Message
    
    users = db.query(User).order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    
    result = []
    for user in users:
        # 사용자 통계 계산
        room_count = db.query(RoomUser).filter(RoomUser.user_id == user.id).count()
        message_count = db.query(Message).filter(Message.user_id == user.id).count()
        
        result.append({
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "created_at": user.created_at.isoformat(),
            "is_active": user.is_active,
            "room_count": room_count,
            "message_count": message_count
        })
    
    total_count = db.query(User).count()
    
    return {
        "users": result,
        "total": total_count,
        "skip": skip,
        "limit": limit
    }


@app.get("/api/admin/rooms")
async def get_all_rooms(
    admin_user: User = Depends(verify_admin),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """모든 채팅방 목록 조회 (관리자 전용)"""
    from shared.database import Room, RoomUser, Message
    
    rooms = db.query(Room).order_by(Room.created_at.desc()).offset(skip).limit(limit).all()
    
    result = []
    for room in rooms:
        member_count = db.query(RoomUser).filter(RoomUser.room_id == room.id).count()
        
        # 마지막 메시지 정보
        last_message = db.query(Message).filter(
            Message.room_id == room.id
        ).order_by(Message.timestamp.desc()).first()
        
        last_message_preview = None
        last_message_time = None
        if last_message:
            if last_message.file_info:
                last_message_preview = f"📎 {last_message.file_info.get('originalName', '파일')}"
            else:
                preview_text = last_message.text
                if len(preview_text) > 50:
                    preview_text = preview_text[:50] + "..."
                last_message_preview = preview_text
            last_message_time = last_message.timestamp.isoformat()
        
        # 생성자 정보
        creator = db.query(User).filter(User.id == room.creator_id).first()
        
        result.append({
            "id": room.id,
            "name": room.name,
            "description": room.description,
            "creator_id": room.creator_id,
            "creator_name": creator.username if creator else "알 수 없음",
            "created_at": room.created_at.isoformat(),
            "is_private": room.is_private,
            "member_count": member_count,
            "last_message": last_message_preview,
            "last_message_time": last_message_time
        })
    
    total_count = db.query(Room).count()
    
    return {
        "rooms": result,
        "total": total_count,
        "skip": skip,
        "limit": limit
    }


@app.get("/api/admin/stats")
async def get_admin_stats(
    admin_user: User = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """관리자 통계 정보 조회"""
    from shared.database import Room, RoomUser, Message
    from datetime import datetime, timedelta
    
    # 전체 통계
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    total_rooms = db.query(Room).count()
    total_messages = db.query(Message).count()
    
    # 최근 7일 통계
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    new_users_7d = db.query(User).filter(User.created_at >= seven_days_ago).count()
    new_rooms_7d = db.query(Room).filter(Room.created_at >= seven_days_ago).count()
    new_messages_7d = db.query(Message).filter(Message.timestamp >= seven_days_ago).count()
    
    # 최근 30일 통계
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    new_users_30d = db.query(User).filter(User.created_at >= thirty_days_ago).count()
    new_rooms_30d = db.query(Room).filter(Room.created_at >= thirty_days_ago).count()
    new_messages_30d = db.query(Message).filter(Message.timestamp >= thirty_days_ago).count()
    
    # 평균 통계
    avg_rooms_per_user = total_rooms / total_users if total_users > 0 else 0
    avg_messages_per_user = total_messages / total_users if total_users > 0 else 0
    avg_messages_per_room = total_messages / total_rooms if total_rooms > 0 else 0
    
    return {
        "total": {
            "users": total_users,
            "active_users": active_users,
            "rooms": total_rooms,
            "messages": total_messages
        },
        "recent_7d": {
            "new_users": new_users_7d,
            "new_rooms": new_rooms_7d,
            "new_messages": new_messages_7d
        },
        "recent_30d": {
            "new_users": new_users_30d,
            "new_rooms": new_rooms_30d,
            "new_messages": new_messages_30d
        },
        "averages": {
            "rooms_per_user": round(avg_rooms_per_user, 2),
            "messages_per_user": round(avg_messages_per_user, 2),
            "messages_per_room": round(avg_messages_per_room, 2)
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
