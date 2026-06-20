import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AuthorizationCode, Token, Client, User, RevokedToken
from ..core import (
    create_access_token,
    create_refresh_token,
    create_authorization_code,
    verify_token,
    verify_pkce,
    settings,
)
from .client_service import validate_client_credentials, validate_redirect_uri


@dataclass
class ExchangeCodeResult:
    access_token: str | None = None
    refresh_token: str | None = None
    expires_in: int | None = None
    scope: str | None = None
    token_family_id: str | None = None
    error: str | None = None

    @property
    def success(self) -> bool:
        return self.error is None


@dataclass
class RefreshTokenResult:
    access_token: str | None = None
    refresh_token: str | None = None
    expires_in: int | None = None
    scope: str | None = None
    token_family_id: str | None = None
    error: str | None = None

    @property
    def success(self) -> bool:
        return self.error is None


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
    code_challenge: str | None = None,
    code_challenge_method: str | None = None,
) -> AuthorizationCode:
    code, expires_at = create_authorization_code(client_id, user_id, redirect_uri, scope)
    db_code = AuthorizationCode(
        code=code,
        client_id=client_id,
        user_id=user_id,
        redirect_uri=redirect_uri,
        scope=scope or "read write",
        expires_at=expires_at.replace(tzinfo=None),
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
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
    token_family_id: str | None = None,
) -> tuple[str, str, int, str]:
    if token_family_id is None:
        token_family_id = str(uuid.uuid4())

    expires_in = settings.access_token_expire_minutes * 60
    access_token, _access_jti = create_access_token(
        subject=user_id,
        additional_claims={
            "client_id": client_id,
            "scope": scope,
            "token_family_id": token_family_id,
        },
    )
    refresh_jti = str(uuid.uuid4())
    refresh_token, _ = create_refresh_token(
        subject=user_id,
        additional_claims={
            "client_id": client_id,
            "scope": scope,
            "jti": refresh_jti,
            "token_family_id": token_family_id,
        },
    )

    refresh_expires_at = _utcnow() + timedelta(days=settings.refresh_token_expire_days)

    db_token = Token(
        refresh_token=refresh_token,
        user_id=user_id,
        client_id=client_id,
        scope=scope,
        expires_at=refresh_expires_at.replace(tzinfo=None),
        token_family_id=token_family_id,
    )
    db.add(db_token)
    await db.commit()

    return access_token, refresh_token, expires_in, token_family_id


async def revoke_all_tokens_in_family(
    db: AsyncSession,
    user_id: int,
    client_id: str,
    token_family_id: str,
) -> int:
    result = await db.execute(
        select(Token).where(
            Token.user_id == user_id,
            Token.client_id == client_id,
            Token.token_family_id == token_family_id,
        )
    )
    tokens = result.scalars().all()
    count = 0
    for t in tokens:
        if not t.is_revoked:
            t.is_revoked = True
            count += 1
    await db.commit()
    return count


async def validate_refresh_token(
    db: AsyncSession, refresh_token: str, client_id: str
) -> tuple[Token | None, bool]:
    payload = await verify_token(refresh_token, expected_type="refresh", db=db)
    if payload is None:
        return None, False
    if payload.get("client_id") != client_id:
        return None, False

    result = await db.execute(
        select(Token).where(Token.refresh_token == refresh_token)
    )
    db_token = result.scalar_one_or_none()

    if db_token is None:
        return None, False

    if db_token.is_revoked:
        return db_token, True

    if db_token.client_id != client_id:
        return None, False
    if _to_aware(db_token.expires_at) < _utcnow():
        return None, False

    return db_token, False


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
    code_verifier: str | None = None,
) -> ExchangeCodeResult:
    client = await validate_client_credentials(db, client_id, client_secret)
    if client is None:
        return ExchangeCodeResult(error="invalid_grant")

    auth_code = await validate_authorization_code(db, code, client_id, redirect_uri)
    if auth_code is None:
        return ExchangeCodeResult(error="invalid_grant")

    if auth_code.code_challenge:
        if not code_verifier:
            return ExchangeCodeResult(error="pkce_verifier_missing")
        if not verify_pkce(
            code_verifier,
            auth_code.code_challenge,
            auth_code.code_challenge_method or "S256",
        ):
            return ExchangeCodeResult(error="pkce_verification_failed")

    await mark_authorization_code_used(db, auth_code)

    scope = auth_code.scope or "read write"
    access_token, refresh_token, expires_in, token_family_id = await create_token_record(
        db, auth_code.user_id, client_id, scope
    )

    return ExchangeCodeResult(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        scope=scope,
        token_family_id=token_family_id,
    )


async def refresh_access_token(
    db: AsyncSession,
    client_id: str,
    client_secret: str,
    refresh_token: str,
) -> RefreshTokenResult:
    client = await validate_client_credentials(db, client_id, client_secret)
    if client is None:
        return RefreshTokenResult(error="invalid_client")

    db_token, was_revoked = await validate_refresh_token(db, refresh_token, client_id)
    if db_token is None:
        return RefreshTokenResult(error="invalid_token")

    if was_revoked:
        family_id = db_token.token_family_id
        if family_id:
            await revoke_all_tokens_in_family(
                db,
                db_token.user_id,
                db_token.client_id,
                family_id,
            )
        return RefreshTokenResult(
            error="replay_detected",
            token_family_id=family_id,
        )

    current_family_id = db_token.token_family_id or str(uuid.uuid4())

    await revoke_refresh_token(db, refresh_token)

    scope = db_token.scope or "read write"
    new_access_token, new_refresh_token, expires_in, _ = await create_token_record(
        db, db_token.user_id, client_id, scope, token_family_id=current_family_id
    )

    return RefreshTokenResult(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=expires_in,
        scope=scope,
        token_family_id=current_family_id,
    )


async def introspect_token(
    db: AsyncSession, token: str, token_type_hint: str | None = None
) -> dict:
    payload = await verify_token(token, expected_type=None, db=db)
    if payload is None:
        return {"active": False}

    token_type = payload.get("type")
    normalized_hint = _normalize_token_type_hint(token_type_hint)
    if normalized_hint and token_type != normalized_hint:
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
        "token_family_id": payload.get("token_family_id"),
    }


@dataclass
class RevokeTokenResult:
    success: bool = False
    revoked_count: int = 0
    error: str | None = None


def _normalize_token_type_hint(hint: str | None) -> str | None:
    if hint is None:
        return None
    hint_lower = hint.lower()
    if hint_lower in ("access_token", "access"):
        return "access"
    if hint_lower in ("refresh_token", "refresh"):
        return "refresh"
    return hint_lower


async def revoke_token(
    db: AsyncSession,
    token: str,
    client_id: str,
    token_type_hint: str | None = None,
) -> RevokeTokenResult:
    payload = await verify_token(token, expected_type=None, db=db)
    if payload is None:
        return RevokeTokenResult(success=True, revoked_count=0)

    token_client_id = payload.get("client_id")
    if token_client_id and token_client_id != client_id:
        return RevokeTokenResult(success=False, error="token_client_mismatch")

    token_type = payload.get("type")
    normalized_hint = _normalize_token_type_hint(token_type_hint)
    if normalized_hint and token_type != normalized_hint:
        return RevokeTokenResult(success=False, error="unsupported_token_type")

    user_id = int(payload["sub"])
    jti = payload.get("jti")
    token_family_id = payload.get("token_family_id")
    exp_timestamp = payload.get("exp")
    expires_at = (
        datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        if exp_timestamp
        else _utcnow() + timedelta(days=1)
    )

    revoked_count = 0

    if token_type == "access":
        if jti:
            existing = await db.execute(
                select(RevokedToken).where(RevokedToken.jti == jti)
            )
            if existing.scalar_one_or_none() is None:
                db_revoked = RevokedToken(
                    jti=jti,
                    token_type="access",
                    user_id=user_id,
                    client_id=token_client_id or client_id,
                    token_family_id=token_family_id,
                    expires_at=expires_at.replace(tzinfo=None),
                )
                db.add(db_revoked)
                revoked_count = 1
        await db.commit()
        return RevokeTokenResult(success=True, revoked_count=revoked_count)

    elif token_type == "refresh":
        if token_family_id:
            result = await db.execute(
                select(Token).where(
                    Token.user_id == user_id,
                    Token.client_id == (token_client_id or client_id),
                    Token.token_family_id == token_family_id,
                )
            )
            tokens = result.scalars().all()
            for t in tokens:
                if not t.is_revoked:
                    t.is_revoked = True
                    revoked_count += 1

            family_marker = await db.execute(
                select(RevokedToken).where(
                    RevokedToken.token_family_id == token_family_id,
                    RevokedToken.jti.is_(None),
                )
            )
            if family_marker.scalar_one_or_none() is None:
                db_family_revoked = RevokedToken(
                    jti=None,
                    token_type="family",
                    user_id=user_id,
                    client_id=token_client_id or client_id,
                    token_family_id=token_family_id,
                    expires_at=expires_at.replace(tzinfo=None),
                )
                db.add(db_family_revoked)
                revoked_count += 1

            if jti:
                existing_jti = await db.execute(
                    select(RevokedToken).where(RevokedToken.jti == jti)
                )
                if existing_jti.scalar_one_or_none() is None:
                    db_revoked = RevokedToken(
                        jti=jti,
                        token_type="refresh",
                        user_id=user_id,
                        client_id=token_client_id or client_id,
                        token_family_id=token_family_id,
                        expires_at=expires_at.replace(tzinfo=None),
                    )
                    db.add(db_revoked)
                    revoked_count += 1

        elif jti:
            existing = await db.execute(
                select(RevokedToken).where(RevokedToken.jti == jti)
            )
            if existing.scalar_one_or_none() is None:
                db_revoked = RevokedToken(
                    jti=jti,
                    token_type="refresh",
                    user_id=user_id,
                    client_id=token_client_id or client_id,
                    token_family_id=token_family_id,
                    expires_at=expires_at.replace(tzinfo=None),
                )
                db.add(db_revoked)
                revoked_count = 1

        await db.commit()
        return RevokeTokenResult(success=True, revoked_count=revoked_count)

    else:
        return RevokeTokenResult(success=False, error="unsupported_token_type")
