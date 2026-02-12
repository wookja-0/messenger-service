from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime
import sys
import os

# 공통 데이터베이스 모델 경로 추가
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from shared.database import init_db, get_db, Room, RoomUser, User, Invitation, Message
from shared.redis_client import cache_get, cache_set, cache_delete_pattern
from shared.cache import invalidate_room_cache
import time

app = FastAPI(title="Room Service", version="1.0.0")

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

# 기본 채팅방 초기화
def init_general_room_with_retry(max_retries=5, delay=2):
    for i in range(max_retries):
        try:
            db = next(get_db())
            initialize_general_room(db)
            db.close()
            return
        except Exception as e:
            if i < max_retries - 1:
                print(f"기본 채팅방 초기화 실패, {delay}초 후 재시도... ({i+1}/{max_retries})")
                time.sleep(delay)
            else:
                print(f"기본 채팅방 초기화 실패: {e}")

# 앱 시작 시 기본 채팅방 초기화 (비동기로 실행)
import threading
def init_general_room_async():
    time.sleep(3)  # DB가 완전히 준비될 때까지 대기
    init_general_room_with_retry()

threading.Thread(target=init_general_room_async, daemon=True).start()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic 모델
class RoomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_private: bool = False


class RoomResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    creator_id: str
    created_at: datetime
    is_private: bool
    member_count: Optional[int] = None
    unread_count: Optional[int] = 0  # 읽지 않은 메시지 수

    class Config:
        from_attributes = True


class RoomMemberResponse(BaseModel):
    id: str
    email: str
    username: str
    joined_at: datetime
    is_admin: bool


class InviteRequest(BaseModel):
    user_ids: List[str]


# 간단한 인증 (실제로는 JWT 토큰 검증 필요)
def get_user_id_from_query(user_id: str = None, db: Session = Depends(get_db)):
    if not user_id:
        raise HTTPException(status_code=401, detail="인증이 필요합니다")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    return user_id


def is_admin_user(user: User) -> bool:
    """관리자 여부 확인"""
    return user.email == "admin@admin.com"


# 기본 채팅방 상수
GENERAL_ROOM_NAME = "오픈채팅방"


def get_or_create_general_room(db: Session) -> Room:
    """기본 채팅방을 가져오거나 생성"""
    # 기본 채팅방 찾기
    general_room = db.query(Room).filter(Room.name == GENERAL_ROOM_NAME).first()
    
    if not general_room:
        # 기본 채팅방이 없으면 생성
        # 첫 번째 활성 사용자를 생성자로 설정 (관리자 제외, 없으면 시스템)
        first_user = db.query(User).filter(
            User.is_active == True,
            User.email != "admin@admin.com"
        ).first()
        creator_id = first_user.id if first_user else "system"
        
        room_id = str(uuid.uuid4())
        general_room = Room(
            id=room_id,
            name=GENERAL_ROOM_NAME,
            description="모든 사용자가 참여하는 오픈 채팅방",
            creator_id=creator_id,
            is_private=False
        )
        db.add(general_room)
        db.commit()
        db.refresh(general_room)
        print(f"[GENERAL_ROOM] 기본 채팅방 생성 완료: {room_id}")
    
    return general_room


def add_user_to_general_room(user_id: str, db: Session) -> bool:
    """사용자를 기본 채팅방에 추가 (관리자 제외)"""
    try:
        # 관리자 계정 확인
        user = db.query(User).filter(User.id == user_id).first()
        if user and is_admin_user(user):
            print(f"[GENERAL_ROOM] 관리자 계정은 기본 채팅방에 추가하지 않음: {user_id}")
            return False
        
        general_room = get_or_create_general_room(db)
        
        # 이미 멤버인지 확인
        existing_member = db.query(RoomUser).filter(
            RoomUser.room_id == general_room.id,
            RoomUser.user_id == user_id
        ).first()
        
        if existing_member:
            return True  # 이미 멤버
        
        # 멤버로 추가
        room_user = RoomUser(
            id=str(uuid.uuid4()),
            room_id=general_room.id,
            user_id=user_id,
            is_admin=False
        )
        db.add(room_user)
        db.commit()
        print(f"[GENERAL_ROOM] 사용자 {user_id}를 기본 채팅방에 추가 완료")
        return True
    except Exception as e:
        print(f"[GENERAL_ROOM] 사용자 추가 실패: {e}")
        db.rollback()
        return False


def initialize_general_room(db: Session):
    """앱 시작 시 기본 채팅방 초기화 및 모든 사용자 추가 (관리자 제외 및 제거)"""
    try:
        general_room = get_or_create_general_room(db)
        
        # 기존에 관리자가 참여하고 있다면 제거
        admin_user = db.query(User).filter(User.email == "admin@admin.com").first()
        if admin_user:
            admin_member = db.query(RoomUser).filter(
                RoomUser.room_id == general_room.id,
                RoomUser.user_id == admin_user.id
            ).first()
            if admin_member:
                db.delete(admin_member)
                db.commit()
                print(f"[GENERAL_ROOM] 관리자 계정을 기본 채팅방에서 제거 완료")
        
        # 모든 활성 사용자 가져오기 (관리자 제외)
        all_users = db.query(User).filter(
            User.is_active == True,
            User.email != "admin@admin.com"
        ).all()
        
        added_count = 0
        for user in all_users:
            # 관리자 계정은 건너뛰기
            if is_admin_user(user):
                continue
                
            # 이미 멤버인지 확인
            existing_member = db.query(RoomUser).filter(
                RoomUser.room_id == general_room.id,
                RoomUser.user_id == user.id
            ).first()
            
            if not existing_member:
                room_user = RoomUser(
                    id=str(uuid.uuid4()),
                    room_id=general_room.id,
                    user_id=user.id,
                    is_admin=False
                )
                db.add(room_user)
                added_count += 1
        
        if added_count > 0:
            db.commit()
            print(f"[GENERAL_ROOM] {added_count}명의 사용자를 기본 채팅방에 추가 완료 (관리자 제외)")
        else:
            print(f"[GENERAL_ROOM] 모든 사용자가 이미 기본 채팅방에 참여 중 (관리자 제외)")
    except Exception as e:
        print(f"[GENERAL_ROOM] 초기화 실패: {e}")
        db.rollback()


# API 엔드포인트
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "room-service"}


@app.post("/api/rooms", response_model=RoomResponse)
async def create_room(
    room_data: RoomCreate,
    user_id: str = Depends(get_user_id_from_query),
    db: Session = Depends(get_db)
):
    """채팅방 생성"""
    try:
        print(f"[CREATE_ROOM] 요청 받음 - user_id: {user_id}, name: {room_data.name}")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"[CREATE_ROOM] 사용자를 찾을 수 없음: {user_id}")
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
        
        room_id = str(uuid.uuid4())
        room = Room(
            id=room_id,
            name=room_data.name,
            description=room_data.description,
            creator_id=user_id,
            is_private=room_data.is_private
        )
        db.add(room)
        
        # 생성자를 멤버로 추가
        room_user = RoomUser(
            id=str(uuid.uuid4()),
            room_id=room_id,
            user_id=user_id,
            is_admin=True
        )
        db.add(room_user)
        
        db.commit()
        db.refresh(room)
        
        # 채팅방 생성 시 캐시 무효화
        invalidate_room_cache(room_id)
        cache_delete_pattern(f"cache:rooms:*")
        
        # RoomResponse 형식에 맞게 반환 (딕셔너리로 반환하면 FastAPI가 자동 변환)
        member_count = db.query(RoomUser).filter(RoomUser.room_id == room.id).count()
        room_dict = {
            "id": room.id,
            "name": room.name,
            "description": room.description,
            "creator_id": room.creator_id,
            "created_at": room.created_at,
            "is_private": room.is_private,
            "member_count": member_count,
            "unread_count": 0  # 새로 생성된 방이므로 읽지 않은 메시지 없음
        }
        result = RoomResponse(**room_dict)
        print(f"[CREATE_ROOM] 성공 - room_id: {room_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CREATE_ROOM] 에러 발생: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"채팅방 생성 중 오류가 발생했습니다: {str(e)}")


@app.get("/api/rooms", response_model=List[RoomResponse])
async def get_rooms(
    user_id: str = Depends(get_user_id_from_query),
    db: Session = Depends(get_db)
):
    """사용자가 참여한 채팅방 목록 조회 (Redis 캐싱)"""
    try:
        print(f"[GET_ROOMS] 요청 받음 - user_id: {user_id}")
        
        # 캐시 키 생성
        cache_key = f"cache:rooms:{user_id}"
        
        # 캐시에서 조회
        cached_result = cache_get(cache_key)
        if cached_result is not None:
            print(f"[GET_ROOMS] 캐시 히트 - user_id: {user_id}")
            return cached_result
        
        # 캐시 미스 - DB에서 조회
        print(f"[GET_ROOMS] 캐시 미스 - DB 조회 시작")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"[GET_ROOMS] 사용자를 찾을 수 없음: {user_id}")
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
        
        # 사용자가 멤버인 방들 조회
        room_users = db.query(RoomUser).filter(RoomUser.user_id == user_id).all()
        room_ids = [ru.room_id for ru in room_users]
        print(f"[GET_ROOMS] 사용자가 참여한 방 수: {len(room_ids)}")
        
        rooms = db.query(Room).filter(Room.id.in_(room_ids)).order_by(Room.created_at.desc()).all()
        
        result = []
        for room in rooms:
            member_count = db.query(RoomUser).filter(RoomUser.room_id == room.id).count()
            
            # 읽지 않은 메시지 수 계산
            room_user = db.query(RoomUser).filter(
                RoomUser.room_id == room.id,
                RoomUser.user_id == user_id
            ).first()
            
            unread_count = 0
            try:
                if room_user and room_user.last_read_at:
                    unread_count = db.query(Message).filter(
                        Message.room_id == room.id,
                        Message.timestamp > room_user.last_read_at,
                        Message.user_id != user_id  # 자신이 보낸 메시지는 제외
                    ).count()
                elif room_user:
                    # last_read_at이 없으면 모든 메시지가 읽지 않은 것으로 간주
                    unread_count = db.query(Message).filter(
                        Message.room_id == room.id,
                        Message.user_id != user_id
                    ).count()
            except Exception as e:
                # 에러 발생 시 0으로 설정
                print(f"[GET_ROOMS] 읽지 않은 메시지 수 계산 중 에러: {e}")
                unread_count = 0
            
            # 마지막 메시지 정보 가져오기
            last_message = db.query(Message).filter(
                Message.room_id == room.id
            ).order_by(Message.timestamp.desc()).first()
            
            last_message_preview = None
            last_message_time = None
            if last_message:
                # 파일 메시지인 경우
                if last_message.file_info:
                    last_message_preview = f"📎 {last_message.file_info.get('originalName', '파일')}"
                else:
                    # 텍스트 메시지인 경우 (최대 50자)
                    preview_text = last_message.text
                    if len(preview_text) > 50:
                        preview_text = preview_text[:50] + "..."
                    last_message_preview = preview_text
                last_message_time = last_message.timestamp.isoformat() + 'Z'
            
            room_dict = {
                "id": room.id,
                "name": room.name,
                "description": room.description,
                "creator_id": room.creator_id,
                "created_at": room.created_at,
                "is_private": room.is_private,
                "member_count": member_count,
                "unread_count": unread_count,
                "last_message": last_message_preview,
                "last_message_time": last_message_time
            }
            result.append(room_dict)
        
        # 결과를 캐시에 저장 (TTL: 5분)
        cache_set(cache_key, result, ttl=300)
        print(f"[GET_ROOMS] 성공 - 반환할 방 수: {len(result)}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GET_ROOMS] 에러 발생: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"채팅방 목록 조회 중 오류가 발생했습니다: {str(e)}")


@app.get("/api/rooms/{room_id}", response_model=RoomResponse)
async def get_room(
    room_id: str,
    user_id: str = Depends(get_user_id_from_query),
    db: Session = Depends(get_db)
):
    """채팅방 상세 정보 조회"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다")
    
    # 멤버인지 확인
    room_user = db.query(RoomUser).filter(
        RoomUser.room_id == room_id,
        RoomUser.user_id == user_id
    ).first()
    
    if not room_user:
        raise HTTPException(status_code=403, detail="채팅방에 접근할 권한이 없습니다")
    
    member_count = db.query(RoomUser).filter(RoomUser.room_id == room_id).count()
    
    return {
        "id": room.id,
        "name": room.name,
        "description": room.description,
        "creator_id": room.creator_id,
        "created_at": room.created_at,
        "is_private": room.is_private,
        "member_count": member_count
    }


@app.get("/api/rooms/{room_id}/members", response_model=List[RoomMemberResponse])
async def get_room_members(
    room_id: str,
    user_id: str = Depends(get_user_id_from_query),
    db: Session = Depends(get_db)
):
    """채팅방 멤버 목록 조회"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    
    # 멤버인지 확인
    room_user = db.query(RoomUser).filter(
        RoomUser.room_id == room_id,
        RoomUser.user_id == user_id
    ).first()
    
    if not room_user:
        raise HTTPException(status_code=403, detail="채팅방에 접근할 권한이 없습니다")
    
    # 멤버 목록 조회
    room_users = db.query(RoomUser).filter(RoomUser.room_id == room_id).all()
    
    result = []
    for ru in room_users:
        user = db.query(User).filter(User.id == ru.user_id).first()
        if user:
            result.append({
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "joined_at": ru.joined_at,
                "is_admin": ru.is_admin
            })
    
    return result


@app.post("/api/rooms/{room_id}/invite")
async def invite_users(
    room_id: str,
    invite_data: InviteRequest,
    user_id: str = Depends(get_user_id_from_query),
    db: Session = Depends(get_db)
):
    """사용자 초대"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    
    # 방 존재 확인 및 권한 확인
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다")
    
    room_user = db.query(RoomUser).filter(
        RoomUser.room_id == room_id,
        RoomUser.user_id == user_id
    ).first()
    
    if not room_user:
        raise HTTPException(status_code=403, detail="채팅방에 접근할 권한이 없습니다")
    
    # 초대할 사용자들 확인
    invited_users = []
    for invitee_id in invite_data.user_ids:
        invitee = db.query(User).filter(User.id == invitee_id).first()
        if not invitee:
            continue
        
        # 이미 멤버인지 확인
        existing_member = db.query(RoomUser).filter(
            RoomUser.room_id == room_id,
            RoomUser.user_id == invitee_id
        ).first()
        
        if existing_member:
            continue
        
        # 멤버로 추가
        room_user_new = RoomUser(
            id=str(uuid.uuid4()),
            room_id=room_id,
            user_id=invitee_id,
            is_admin=False
        )
        db.add(room_user_new)
        invited_users.append({
            "id": invitee.id,
            "email": invitee.email,
            "username": invitee.username
        })
    
    db.commit()
    
    # 사용자 초대 시 캐시 무효화
    cache_delete_pattern(f"cache:rooms:*")
    
    return {
        "message": f"{len(invited_users)}명의 사용자가 초대되었습니다",
        "invited_users": invited_users
    }


@app.delete("/api/rooms/{room_id}/members/{member_id}")
async def remove_member(
    room_id: str,
    member_id: str,
    user_id: str = Depends(get_user_id_from_query),
    db: Session = Depends(get_db)
):
    """멤버 제거 (관리자만 가능)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    
    # 관리자 권한 확인
    room_user = db.query(RoomUser).filter(
        RoomUser.room_id == room_id,
        RoomUser.user_id == user_id,
        RoomUser.is_admin == True
    ).first()
    
    if not room_user:
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")
    
    # 제거할 멤버 확인
    member_room_user = db.query(RoomUser).filter(
        RoomUser.room_id == room_id,
        RoomUser.user_id == member_id
    ).first()
    
    if not member_room_user:
        raise HTTPException(status_code=404, detail="멤버를 찾을 수 없습니다")
    
    if member_room_user.is_admin:
        raise HTTPException(status_code=400, detail="관리자는 제거할 수 없습니다")
    
    db.delete(member_room_user)
    db.commit()
    
    return {"message": "멤버가 제거되었습니다"}


@app.delete("/api/rooms/{room_id}")
async def delete_room(
    room_id: str,
    user_id: str = Depends(get_user_id_from_query),
    db: Session = Depends(get_db)
):
    """채팅방 삭제 (방 생성자만 가능)"""
    try:
        print(f"[DELETE_ROOM] 요청 받음 - room_id: {room_id}, user_id: {user_id}")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
        
        # 방 존재 확인
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다")
        
        # 방 생성자인지 확인
        if room.creator_id != user_id:
            raise HTTPException(status_code=403, detail="채팅방을 삭제할 권한이 없습니다. 방 생성자만 삭제할 수 있습니다")
        
        # 방 삭제 (CASCADE로 인해 관련된 RoomUser, Message도 자동 삭제됨)
        db.delete(room)
        db.commit()
        
        # 채팅방 삭제 시 캐시 무효화
        invalidate_room_cache(room_id)
        cache_delete_pattern(f"cache:rooms:*")
        
        print(f"[DELETE_ROOM] 성공 - room_id: {room_id}")
        return {"message": "채팅방이 삭제되었습니다"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[DELETE_ROOM] 에러 발생: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"채팅방 삭제 중 오류가 발생했습니다: {str(e)}")


@app.delete("/api/rooms/{room_id}/leave")
async def leave_room(
    room_id: str,
    user_id: str = Depends(get_user_id_from_query),
    db: Session = Depends(get_db)
):
    """채팅방 나가기 (초대받은 사용자만 가능, 방 생성자는 삭제를 사용해야 함)"""
    try:
        print(f"[LEAVE_ROOM] 요청 받음 - room_id: {room_id}, user_id: {user_id}")
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
        
        # 방 존재 확인
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다")
        
        # 방 생성자인지 확인 (생성자는 나가기 대신 삭제를 사용해야 함)
        if room.creator_id == user_id:
            raise HTTPException(
                status_code=400, 
                detail="방 생성자는 나갈 수 없습니다. 채팅방을 삭제해주세요"
            )
        
        # 멤버인지 확인
        room_user = db.query(RoomUser).filter(
            RoomUser.room_id == room_id,
            RoomUser.user_id == user_id
        ).first()
        
        if not room_user:
            raise HTTPException(status_code=404, detail="채팅방 멤버가 아닙니다")
        
        # 멤버에서 제거
        db.delete(room_user)
        db.commit()
        
        # 채팅방 나가기 시 캐시 무효화
        cache_delete_pattern(f"cache:rooms:{user_id}")
        cache_delete_pattern(f"cache:rooms:*")
        
        print(f"[LEAVE_ROOM] 성공 - room_id: {room_id}, user_id: {user_id}")
        return {"message": "채팅방에서 나갔습니다"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[LEAVE_ROOM] 에러 발생: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"채팅방 나가기 중 오류가 발생했습니다: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
