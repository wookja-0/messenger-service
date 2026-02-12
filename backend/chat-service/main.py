from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import json
import uuid
from datetime import datetime
from pydantic import BaseModel
import sys
import os
from jose import jwt

# 공통 데이터베이스 모델 경로 추가
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from shared.database import init_db, get_db, Message, Room, RoomUser, User
from shared.redis_client import (
    add_online_user, remove_online_user, 
    get_online_users_in_room, get_online_rooms_for_user,
    is_user_online_in_room
)
import time

app = FastAPI(title="Chat Service", version="1.0.0")

# JWT 설정 (auth-service와 동일한 SECRET_KEY 사용)
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

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

# 메모리 내 연결 관리: {room_id: {socket_id: websocket}}
room_connections: Dict[str, Dict[str, WebSocket]] = {}
# 사용자 정보: {socket_id: {user_id, username, room_id}}
socket_users: Dict[str, Dict] = {}
# 온라인 사용자 추적은 이제 Redis에서 관리


class MessageRequest(BaseModel):
    text: str


def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """JWT 토큰을 검증하여 현재 사용자 정보 반환"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증이 필요합니다",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if not token:
        raise credentials_exception
    
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


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "chat-service"}


def is_admin_user(user: User) -> bool:
    """관리자 여부 확인"""
    return user.email == "admin@admin.com"


@app.get("/api/rooms/{room_id}/messages")
async def get_messages(
    room_id: str, 
    user_id: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db), 
    limit: int = 100
):
    """채팅방 메시지 조회"""
    if not user_id:
        user_id = current_user.id
    
    # 관리자는 모든 메시지 조회 가능
    is_admin = is_admin_user(current_user)
    
    if not is_admin:
        # 권한 확인
        room_user = db.query(RoomUser).filter(
            RoomUser.room_id == room_id,
            RoomUser.user_id == user_id
        ).first()
        
        if not room_user:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="채팅방에 접근할 권한이 없습니다")
    
    messages = db.query(Message).filter(
        Message.room_id == room_id
    ).order_by(Message.timestamp.desc()).limit(limit).all()
    
    result = []
    for msg in reversed(messages):
        user_profile_image = None
        if msg.user_id:
            user = db.query(User).filter(User.id == msg.user_id).first()
            if user:
                user_profile_image = user.profile_image_url
        
        result.append({
            "id": msg.id,
            "user_id": msg.user_id,
            "username": msg.username,
            "text": msg.text,
            "timestamp": msg.timestamp.isoformat(),
            "socketId": msg.socket_id,
            "fileInfo": msg.file_info,  # 파일 정보 포함
            "profile_image_url": user_profile_image  # 프로필 이미지 URL 포함
        })
    
    return result


@app.get("/api/admin/rooms/{room_id}/messages")
async def get_admin_messages(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 500
):
    """관리자용 채팅방 메시지 조회 (모든 메시지 조회 가능)"""
    # 관리자 권한 확인
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다"
        )
    
    # 방 존재 확인
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다")
    
    messages = db.query(Message).filter(
        Message.room_id == room_id
    ).order_by(Message.timestamp.asc()).limit(limit).all()
    
    return [
        {
            "id": msg.id,
            "user_id": msg.user_id,
            "username": msg.username,
            "text": msg.text,
            "timestamp": msg.timestamp.isoformat(),
            "socketId": msg.socket_id,
            "fileInfo": msg.file_info
        }
        for msg in messages
    ]


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    """WebSocket 연결 처리 (room 기반)"""
    await websocket.accept()
    socket_id = str(uuid.uuid4())
    
    # room_connections 초기화
    if room_id not in room_connections:
        room_connections[room_id] = {}
    room_connections[room_id][socket_id] = websocket
    
    db = next(get_db())
    
    try:
        # 사용자 입장 대기
        data = await websocket.receive_text()
        user_data = json.loads(data)
        
        if user_data.get("type") == "join":
            user_id = user_data.get("user_id")
            username = user_data.get("username", "익명")
            
            # 권한 확인
            room = db.query(Room).filter(Room.id == room_id).first()
            if not room:
                await websocket.send_json({
                    "type": "error",
                    "message": "채팅방을 찾을 수 없습니다"
                })
                await websocket.close()
                return
            
            room_user = db.query(RoomUser).filter(
                RoomUser.room_id == room_id,
                RoomUser.user_id == user_id
            ).first()
            
            if not room_user:
                await websocket.send_json({
                    "type": "error",
                    "message": "채팅방에 접근할 권한이 없습니다"
                })
                await websocket.close()
                return
            
            # 사용자 정보 저장
            socket_users[socket_id] = {
                "user_id": user_id,
                "username": username,
                "room_id": room_id
            }
            
            # 온라인 사용자 추적 (Redis)
            add_online_user(room_id, user_id)
            
            # 마지막 읽은 시간 업데이트 (채팅방 입장 시)
            from datetime import datetime
            room_user = db.query(RoomUser).filter(
                RoomUser.room_id == room_id,
                RoomUser.user_id == user_id
            ).first()
            if room_user:
                room_user.last_read_at = datetime.utcnow()
                db.commit()
            
            # 기존 메시지 전송
            messages = db.query(Message).filter(
                Message.room_id == room_id
            ).order_by(Message.timestamp.asc()).limit(100).all()
            
            # 메시지에 프로필 이미지 URL 포함
            messages_with_profile = []
            for msg in messages:
                user_profile_image = None
                if msg.user_id:
                    user = db.query(User).filter(User.id == msg.user_id).first()
                    if user:
                        user_profile_image = user.profile_image_url
                
                messages_with_profile.append({
                    "id": msg.id,
                    "user_id": msg.user_id,
                    "username": msg.username,
                    "text": msg.text,
                    "timestamp": msg.timestamp.isoformat() + 'Z',  # UTC 표시를 위해 'Z' 추가
                    "socketId": msg.socket_id,
                    "fileInfo": msg.file_info,  # 파일 정보 포함
                    "profile_image_url": user_profile_image  # 프로필 이미지 URL 포함
                })
            
            await websocket.send_json({
                "type": "previousMessages",
                "messages": messages_with_profile
            })
            
            # 입장 알림 제거 (사용자 요청)
            
            # 현재 참여자 목록 전송 (온라인 상태 포함)
            current_members = get_room_members(room_id, db)
            await websocket.send_json({
                "type": "roomMembers",
                "members": current_members
            })
            
            # 다른 사용자들에게 참여자 목록 업데이트 알림
            await broadcast_to_room(room_id, {
                "type": "roomMembers",
                "members": current_members
            }, websocket)
            
            # 메시지 수신 루프
            while True:
                data = await websocket.receive_text()
                message_data = json.loads(data)
                
                if message_data.get("type") == "message":
                    user_info = socket_users.get(socket_id)
                    if not user_info:
                        continue
                    
                    message_id = str(uuid.uuid4())
                    message_text = message_data.get("text", "")
                    message_timestamp = datetime.utcnow()  # UTC로 저장
                    file_info = message_data.get("fileInfo")
                    
                    # DB에 메시지 저장
                    db_message = Message(
                        id=message_id,
                        room_id=room_id,
                        user_id=user_info["user_id"],
                        username=user_info["username"],
                        text=message_text,
                        timestamp=message_timestamp,
                        socket_id=socket_id,
                        file_info=file_info  # 파일 정보 저장
                    )
                    db.add(db_message)
                    db.commit()
                    
                    # 사용자 프로필 이미지 가져오기
                    user_profile_image = None
                    if user_info["user_id"]:
                        user = db.query(User).filter(User.id == user_info["user_id"]).first()
                        if user:
                            user_profile_image = user.profile_image_url
                    
                    message = {
                        "id": message_id,
                        "user_id": user_info["user_id"],
                        "username": user_info["username"],
                        "text": message_text,
                        "timestamp": message_timestamp.isoformat(),
                        "socketId": socket_id,
                        "profile_image_url": user_profile_image
                    }
                    
                    if file_info:
                        message["fileInfo"] = file_info
                    
                    # 방의 모든 클라이언트에 메시지 브로드캐스트 (자신 포함)
                    await broadcast_to_room(room_id, {
                        "type": "message",
                        **message
                    }, None)  # exclude_websocket을 None으로 설정하여 자신에게도 전송
                    
    except WebSocketDisconnect:
        user_info = socket_users.get(socket_id)
        if user_info:
            # 온라인 사용자에서 제거 (Redis)
            user_id = user_info["user_id"]
            remove_online_user(room_id, user_id)
            
            del socket_users[socket_id]
        
        if room_id in room_connections and socket_id in room_connections[room_id]:
            del room_connections[room_id][socket_id]
    finally:
        db.close()


async def broadcast_to_room(room_id: str, message: dict, exclude_websocket: WebSocket = None):
    """특정 방의 모든 연결된 클라이언트에 메시지 브로드캐스트"""
    if room_id not in room_connections:
        print(f"[BROADCAST] 방 {room_id}에 연결된 클라이언트 없음")
        return
    
    print(f"[BROADCAST] 방 {room_id}에 메시지 브로드캐스트 시작 - 연결 수: {len(room_connections[room_id])}")
    disconnected = []
    success_count = 0
    
    for socket_id, connection in room_connections[room_id].items():
        if connection != exclude_websocket:
            try:
                await connection.send_json(message)
                success_count += 1
            except Exception as e:
                print(f"[BROADCAST] 메시지 전송 실패 (socket_id: {socket_id}): {e}")
                disconnected.append(socket_id)
    
    print(f"[BROADCAST] 성공: {success_count}, 실패: {len(disconnected)}")
    
    # 연결이 끊어진 소켓 제거
    for socket_id in disconnected:
        if room_id in room_connections and socket_id in room_connections[room_id]:
            del room_connections[room_id][socket_id]
        if socket_id in socket_users:
            del socket_users[socket_id]


def get_room_members(room_id: str, db: Session):
    """방의 현재 참여자 목록 조회"""
    room_users = db.query(RoomUser).filter(RoomUser.room_id == room_id).all()
    # Redis에서 온라인 사용자 목록 조회
    online_user_ids = get_online_users_in_room(room_id)
    
    members = []
    for ru in room_users:
        user = db.query(User).filter(User.id == ru.user_id).first()
        if user:
            # 온라인 상태 확인 (Redis)
            is_online = user.id in online_user_ids
            members.append({
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "is_admin": ru.is_admin,
                "is_online": is_online
            })
    return members


@app.get("/api/online-users")
async def get_online_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """전체 온라인 사용자 목록 조회 (인증 필요) - Redis에서 조회"""
    try:
        print(f"[GET_ONLINE_USERS] 요청 받음 - 사용자: {current_user.id}")
        online_list = []
        
        # Redis에서 모든 온라인 사용자의 방 목록 조회
        # online:users:* 패턴으로 모든 사용자 ID 찾기
        from shared.redis_client import get_redis
        r = get_redis()
        if r:
            # 모든 online:users:* 키 찾기
            user_keys = r.keys("online:users:*")
            for key in user_keys:
                user_id = key.replace("online:users:", "")
                # 사용자가 참여 중인 방 목록
                rooms = get_online_rooms_for_user(user_id)
                if rooms:
                    # 사용자 정보 조회
                    user = db.query(User).filter(User.id == user_id).first()
                    if user:
                        online_list.append({
                            "id": user_id,
                            "username": user.username,
                            "rooms": list(rooms)
                        })
        
        print(f"[GET_ONLINE_USERS] 성공 - 온라인 사용자 수: {len(online_list)}")
        return online_list
    except Exception as e:
        print(f"[GET_ONLINE_USERS] 에러 발생: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="온라인 사용자 목록을 가져오는 중 오류가 발생했습니다"
        )


if __name__ == "__main__":
    from fastapi import HTTPException
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
