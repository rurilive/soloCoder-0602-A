import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AuthorizationCode, Token, Client, User
from ..core import (
    create_access_token,
    create_refresh_token,
    create_authorization_code,
    verify_token,
    settings,
)
from .client_service import validate_client_credentials, validate_redirect_uri


def _to_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def create_authorization_code_record(
    db: AsyncSession,
    client_id: str,
    user_id: int,
    redirect_uri: str,
    scope: str | None = None,
) -> AuthorizationCode:
    code, expires_at = create_authorization_code(client_id, user_id, redirect_uri, scope)
    db_code = AuthorizationCode(
        code=code,
        client_id=client_id,
        user_id=user_id,
        redirect_uri=redirect_uri,
        scope=scope or "read write",
        expires_at=expires_at.replace(tzinfo=None),
    )
    db.add(db_code)
    await db.commit()
    await db.refresh(db_code)
    return db_code


async def validate_authorization_code(
    db: AsyncSession, code: str, client_id: str, redirect_uri: str
) -> AuthorizationCode | None:
    result = await db.execute(select(AuthorizationCode).where(AuthorizationCode.code == code))
    auth_code = result.scalar_one_or_none()

    if auth_code is None:
        return None
    if auth_code.is_used:
        return None
    if auth_code.client_id != client_id:
        return None
    if auth_code.redirect_uri != redirect_uri:
        return None
    if _to_aware(auth_code.expires_at) < _utcnow():
        return None

    return auth_code


async def mark_authorization_code_used(db: AsyncSession, auth_code: AuthorizationCode) -> None:
    auth_code.is_used = True
    await db.commit()


async def create_token_record(
    db: AsyncSession,
    user_id: int,
    client_id: str,
    scope: str,
) -> tuple[str, str, int]:
    expires_in = settings.access_token_expire_minutes * 60
    access_token = create_access_token(
        subject=user_id,
        additional_claims={"client_id": client_id, "scope": scope},
    )
    refresh_token = create_refresh_token(
        subject=user_id,
        additional_claims={
            "client_id": client_id,
            "scope": scope,
            "jti": str(uuid.uuid4()),
        },
    )

    refresh_expires_at = _utcnow() + timedelta(days=settings.refresh_token_expire_days)

    db_token = Token(
        refresh_token=refresh_token,
        user_id=user_id,
        client_id=client_id,
        scope=scope,
        expires_at=refresh_expires_at.replace(tzinfo=None),
    )
    db.add(db_token)
    await db.commit()

    return access_token, refresh_token, expires_in


async def validate_refresh_token(
    db: AsyncSession, refresh_token: str, client_id: str
) -> Token | None:
    payload = verify_token(refresh_token, expected_type="refresh")
    if payload is None:
        return None
    if payload.get("client_id") != client_id:
        return None

    result = await db.execute(
        select(Token).where(Token.refresh_token == refresh_token)
    )
    db_token = result.scalar_one_or_none()

    if db_token is None:
        return None
    if db_token.is_revoked:
        return None
    if db_token.client_id != client_id:
        return None
    if _to_aware(db_token.expires_at) < _utcnow():
        return None

    return db_token


async def revoke_refresh_token(db: AsyncSession, refresh_token: str) -> bool:
    result = await db.execute(
        select(Token).where(Token.refresh_token == refresh_token)
    )
    db_token = result.scalar_one_or_none()
    if db_token is None:
        return False
    db_token.is_revoked = True
    await db.commit()
    return True


async def exchange_authorization_code(
    db: AsyncSession,
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
) -> tuple[str, str, int, str] | None:
    client = await validate_client_credentials(db, client_id, client_secret)
    if client is None:
        return None

    auth_code = await validate_authorization_code(db, code, client_id, redirect_uri)
    if auth_code is None:
        return None

    await mark_authorization_code_used(db, auth_code)

    scope = auth_code.scope or "read write"
    access_token, refresh_token, expires_in = await create_token_record(
        db, auth_code.user_id, client_id, scope
    )

    return access_token, refresh_token, expires_in, scope


async def refresh_access_token(
    db: AsyncSession,
    client_id: str,
    client_secret: str,
    refresh_token: str,
) -> tuple[str, str, int, str] | None:
    client = await validate_client_credentials(db, client_id, client_secret)
    if client is None:
        return None

    db_token = await validate_refresh_token(db, refresh_token, client_id)
    if db_token is None:
        return None

    await revoke_refresh_token(db, refresh_token)

    scope = db_token.scope or "read write"
    new_access_token, new_refresh_token, expires_in = await create_token_record(
        db, db_token.user_id, client_id, scope
    )

    return new_access_token, new_refresh_token, expires_in, scope


async def introspect_token(
    db: AsyncSession, token: str, token_type_hint: str | None = None
) -> dict:
    payload = verify_token(token, expected_type=None)
    if payload is None:
        return {"active": False}

    token_type = payload.get("type")
    if token_type_hint and token_type != token_type_hint:
        return {"active": False}

    if token_type == "refresh":
        result = await db.execute(
            select(Token).where(Token.refresh_token == token)
        )
        db_token = result.scalar_one_or_none()
        if db_token is None or db_token.is_revoked:
            return {"active": False}
        if _to_aware(db_token.expires_at) < _utcnow():
            return {"active": False}

    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()

    return {
        "active": True,
        "scope": payload.get("scope"),
        "client_id": payload.get("client_id"),
        "username": user.username if user else None,
        "exp": payload.get("exp"),
    }
