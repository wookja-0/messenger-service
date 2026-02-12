from functools import wraps
import hashlib
import json
from typing import Callable, Any, Optional
import logging
from .redis_client import cache_get, cache_set, cache_delete, cache_delete_pattern

logger = logging.getLogger(__name__)


def generate_cache_key(func_name: str, *args, **kwargs) -> str:
    """캐시 키 생성"""
    # 함수명과 인자를 기반으로 키 생성
    key_parts = [func_name]
    
    # 위치 인자 추가
    for arg in args:
        if isinstance(arg, (str, int, float, bool)):
            key_parts.append(str(arg))
        elif hasattr(arg, 'id'):  # 객체의 경우 id 사용
            key_parts.append(str(arg.id))
    
    # 키워드 인자 추가
    for k, v in sorted(kwargs.items()):
        if isinstance(v, (str, int, float, bool)):
            key_parts.append(f"{k}:{v}")
        elif hasattr(v, 'id'):
            key_parts.append(f"{k}:{v.id}")
    
    key_string = ":".join(key_parts)
    # 해시로 변환하여 키 길이 제한
    key_hash = hashlib.md5(key_string.encode()).hexdigest()
    return f"cache:{func_name}:{key_hash}"


def cache_result(ttl: int = 300, key_prefix: Optional[str] = None):
    """
    함수 결과를 캐싱하는 데코레이터
    
    Args:
        ttl: 캐시 TTL (초)
        key_prefix: 캐시 키 접두사 (기본값: 함수명)
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            prefix = key_prefix or func.__name__
            cache_key = generate_cache_key(prefix, *args, **kwargs)
            
            # 캐시에서 조회
            cached_result = cache_get(cache_key)
            if cached_result is not None:
                logger.debug(f"캐시 히트: {cache_key}")
                return cached_result
            
            # 캐시 미스 - 함수 실행
            logger.debug(f"캐시 미스: {cache_key}")
            result = await func(*args, **kwargs)
            
            # 결과 캐싱
            cache_set(cache_key, result, ttl)
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            prefix = key_prefix or func.__name__
            cache_key = generate_cache_key(prefix, *args, **kwargs)
            
            # 캐시에서 조회
            cached_result = cache_get(cache_key)
            if cached_result is not None:
                logger.debug(f"캐시 히트: {cache_key}")
                return cached_result
            
            # 캐시 미스 - 함수 실행
            logger.debug(f"캐시 미스: {cache_key}")
            result = func(*args, **kwargs)
            
            # 결과 캐싱
            cache_set(cache_key, result, ttl)
            return result
        
        # 비동기 함수인지 확인
        if hasattr(func, '__code__') and 'async' in str(func.__code__.co_flags):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def invalidate_cache(pattern: str):
    """
    캐시 무효화 데코레이터
    함수 실행 후 패턴에 맞는 캐시를 삭제
    
    Args:
        pattern: 삭제할 캐시 키 패턴 (예: "cache:rooms:*")
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            result = await func(*args, **kwargs)
            cache_delete_pattern(pattern)
            logger.debug(f"캐시 무효화: {pattern}")
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            cache_delete_pattern(pattern)
            logger.debug(f"캐시 무효화: {pattern}")
            return result
        
        # 비동기 함수인지 확인
        if hasattr(func, '__code__') and 'async' in str(func.__code__.co_flags):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def invalidate_user_cache(user_id: str):
    """사용자 관련 캐시 무효화"""
    patterns = [
        f"cache:user:{user_id}",
        f"cache:rooms:{user_id}",
        f"cache:*:{user_id}*"
    ]
    for pattern in patterns:
        cache_delete_pattern(pattern)
    logger.debug(f"사용자 캐시 무효화: {user_id}")


def invalidate_room_cache(room_id: str):
    """채팅방 관련 캐시 무효화"""
    patterns = [
        f"cache:rooms:*",
        f"cache:messages:{room_id}",
        f"cache:*:{room_id}*"
    ]
    for pattern in patterns:
        cache_delete_pattern(pattern)
    logger.debug(f"채팅방 캐시 무효화: {room_id}")
