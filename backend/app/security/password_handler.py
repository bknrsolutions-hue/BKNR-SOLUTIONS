from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],   # ✅ NO bcrypt at all
    deprecated="auto"
)

def hash_password(password: str) -> str:
    if not password:
        raise ValueError("Password cannot be empty")
    return pwd_context.hash(password)

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(password, hashed_password)
    except Exception:
        return False
