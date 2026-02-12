import redis
import os
import json
from typing import Optional, Any, List, Set
from functools import wraps
import logging

logger = logging.getLogger(__name__)

# Redis 연결 설정
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

# Redis 연결 풀 생성
try:
    redis_client = redis.from_url(
        REDIS_URL,
        password=REDIS_PASSWORD,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
        health_check_interval=30
    )
    # 연결 테스트
    redis_client.ping()
    logger.info("Redis 연결 성공")
except Exception as e:
    logger.error(f"Redis 연결 실패: {e}")
    redis_client = None


def get_redis() -> Optional[redis.Redis]:
    """Redis 클라이언트 반환"""
    if redis_client is None:
        return None
    try:
        redis_client.ping()
        return redis_client
    except Exception as e:
        logger.error(f"Redis 연결 확인 실패: {e}")
        return None


# 온라인 사용자 관리
def add_online_user(room_id: str, user_id: str) -> bool:
    """온라인 사용자 추가"""
    r = get_redis()
    if not r:
        return False
    try:
        r.sadd(f"online:rooms:{room_id}", user_id)
        r.sadd(f"online:users:{user_id}", room_id)
        # TTL 설정 (1시간)
        r.expire(f"online:rooms:{room_id}", 3600)
        r.expire(f"online:users:{user_id}", 3600)
        return True
    except Exception as e:
        logger.error(f"온라인 사용자 추가 실패: {e}")
        return False


def remove_online_user(room_id: str, user_id: str) -> bool:
    """온라인 사용자 제거"""
    r = get_redis()
    if not r:
        return False
    try:
        r.srem(f"online:rooms:{room_id}", user_id)
        r.srem(f"online:users:{user_id}", room_id)
        return True
    except Exception as e:
        logger.error(f"온라인 사용자 제거 실패: {e}")
        return False


def get_online_users_in_room(room_id: str) -> Set[str]:
    """방의 온라인 사용자 목록 조회"""
    r = get_redis()
    if not r:
        return set()
    try:
        return r.smembers(f"online:rooms:{room_id}")
    except Exception as e:
        logger.error(f"온라인 사용자 조회 실패: {e}")
        return set()


def get_online_rooms_for_user(user_id: str) -> Set[str]:
    """사용자가 참여 중인 온라인 방 목록 조회"""
    r = get_redis()
    if not r:
        return set()
    try:
        return r.smembers(f"online:users:{user_id}")
    except Exception as e:
        logger.error(f"온라인 방 조회 실패: {e}")
        return set()


def is_user_online_in_room(room_id: str, user_id: str) -> bool:
    """사용자가 특정 방에 온라인인지 확인"""
    r = get_redis()
    if not r:
        return False
    try:
        return r.sismember(f"online:rooms:{room_id}", user_id)
    except Exception as e:
        logger.error(f"온라인 상태 확인 실패: {e}")
        return False


# 캐싱 헬퍼 함수
def cache_get(key: str) -> Optional[Any]:
    """캐시에서 값 조회"""
    r = get_redis()
    if not r:
        return None
    try:
        value = r.get(key)
        if value:
            return json.loads(value)
        return None
    except Exception as e:
        logger.error(f"캐시 조회 실패: {e}")
        return None


def cache_set(key: str, value: Any, ttl: int = 300) -> bool:
    """캐시에 값 저장"""
    r = get_redis()
    if not r:
        return False
    try:
        r.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as e:
        logger.error(f"캐시 저장 실패: {e}")
        return False


def cache_delete(key: str) -> bool:
    """캐시에서 값 삭제"""
    r = get_redis()
    if not r:
        return False
    try:
        r.delete(key)
        return True
    except Exception as e:
        logger.error(f"캐시 삭제 실패: {e}")
        return False


def cache_delete_pattern(pattern: str) -> int:
    """패턴에 맞는 캐시 키 삭제"""
    r = get_redis()
    if not r:
        return 0
    try:
        keys = r.keys(pattern)
        if keys:
            return r.delete(*keys)
        return 0
    except Exception as e:
        logger.error(f"패턴 캐시 삭제 실패: {e}")
        return 0


# Hash 캐싱 (사용자 정보 등)
def cache_hash_set(key: str, field: str, value: Any, ttl: int = 600) -> bool:
    """Hash 캐시에 필드 저장"""
    r = get_redis()
    if not r:
        return False
    try:
        r.hset(key, field, json.dumps(value, default=str))
        r.expire(key, ttl)
        return True
    except Exception as e:
        logger.error(f"Hash 캐시 저장 실패: {e}")
        return False


def cache_hash_get(key: str, field: str) -> Optional[Any]:
    """Hash 캐시에서 필드 조회"""
    r = get_redis()
    if not r:
        return None
    try:
        value = r.hget(key, field)
        if value:
            return json.loads(value)
        return None
    except Exception as e:
        logger.error(f"Hash 캐시 조회 실패: {e}")
        return None


def cache_hash_get_all(key: str) -> Optional[dict]:
    """Hash 캐시에서 모든 필드 조회"""
    r = get_redis()
    if not r:
        return None
    try:
        data = r.hgetall(key)
        if data:
            return {k: json.loads(v) for k, v in data.items()}
        return None
    except Exception as e:
        logger.error(f"Hash 캐시 전체 조회 실패: {e}")
        return None


# Rate Limiting
def check_rate_limit(key: str, limit: int, window: int) -> tuple:
    """
    Rate limit 확인
    Returns: (is_allowed, remaining)
    """
    r = get_redis()
    if not r:
        return True, limit  # Redis가 없으면 제한 없음
    
    try:
        current = r.get(key)
        if current is None:
            r.setex(key, window, 1)
            return True, limit - 1
        else:
            count = int(current)
            if count >= limit:
                return False, 0
            else:
                r.incr(key)
                return True, limit - count - 1
    except Exception as e:
        logger.error(f"Rate limit 확인 실패: {e}")
        return True, limit  # 에러 시 허용
