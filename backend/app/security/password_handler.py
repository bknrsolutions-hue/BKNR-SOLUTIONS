from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

def _normalize_password(password: str) -> bytes:
    """
    bcrypt supports max 72 BYTES (not chars)
    """
    if not password:
        return b""

    # convert to bytes
    pwd_bytes = password.encode("utf-8")

    # strict 72 bytes limit
    return pwd_bytes[:72]

def hash_password(password: str) -> str:
    safe_bytes = _normalize_password(password)
    return pwd_context.hash(safe_bytes)

def verify_password(password: str, hashed_password: str) -> bool:
    safe_bytes = _normalize_password(password)
    return pwd_context.verify(safe_bytes, hashed_password)
