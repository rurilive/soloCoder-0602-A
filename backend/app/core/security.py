import base64
import hashlib
import re
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from .settings import settings


PKCE_CODE_VERIFIER_PATTERN = re.compile(r"^[A-Za-z0-9\-._~]{43,128}$")


def generate_code_verifier(length: int = 64) -> str:
    if length < 43 or length > 128:
        raise ValueError("code_verifier length must be between 43 and 128 characters")
    alphabet = string.ascii_letters + string.digits + "-._~"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def validate_code_verifier(code_verifier: str) -> bool:
    return bool(PKCE_CODE_VERIFIER_PATTERN.match(code_verifier))


def compute_code_challenge_s256(code_verifier: str) -> str:
    hashed = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(hashed).rstrip(b"=").decode("ascii")


def compute_code_challenge(code_verifier: str, method: str = "S256") -> str:
    if method == "S256":
        return compute_code_challenge_s256(code_verifier)
    elif method == "plain":
        return code_verifier
    else:
        raise ValueError(f"Unsupported code_challenge_method: {method}")


def verify_pkce(
    code_verifier: str,
    code_challenge: str,
    code_challenge_method: str,
) -> bool:
    if not validate_code_verifier(code_verifier):
        return False
    try:
        expected = compute_code_challenge(code_verifier, code_challenge_method)
        return secrets.compare_digest(expected, code_challenge)
    except ValueError:
        return False


def generate_client_id(length: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_client_secret(length: int = 64) -> str:
    alphabet = string.ascii_letters + string.digits + "-._~"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_authorization_code() -> str:
    return secrets.token_urlsafe(48)


def generate_device_code() -> str:
    return secrets.token_urlsafe(48)


def generate_user_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(8))
        formatted = code[:4] + "-" + code[4:]
        return formatted


def get_password_hash(password: str) -> str:
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        password_bytes = plain_password.encode("utf-8")
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except (ValueError, TypeError):
        return False


def create_access_token(
    subject: str | int,
    additional_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    to_encode = additional_claims.copy() if additional_claims else {}
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.access_token_expire_minutes
        )
    to_encode.update({"exp": expire, "sub": str(subject), "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_refresh_token(
    subject: str | int,
    additional_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    to_encode = additional_claims.copy() if additional_claims else {}
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            days=settings.refresh_token_expire_days
        )
    to_encode.update({"exp": expire, "sub": str(subject), "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_authorization_code(
    client_id: str,
    user_id: int,
    redirect_uri: str,
    scope: str | None = None,
    expires_delta: timedelta | None = None,
) -> tuple[str, datetime]:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            seconds=settings.authorization_code_expire_seconds
        )
    code = generate_authorization_code()
    return code, expire


def verify_token(
    token: str,
    expected_type: str | None = "access",
) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        if expected_type is not None:
            token_type = payload.get("type")
            if token_type != expected_type:
                return None
        return payload
    except JWTError:
        return None
