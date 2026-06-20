import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import DeviceAuthorization, Client, User
from ..core import (
    generate_device_code,
    generate_user_code,
    settings,
)
from .client_service import validate_client_credentials
from .oauth2_service import create_token_record, RefreshTokenResult, ExchangeCodeResult


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@dataclass
class DeviceCodeTokenResult:
    access_token: str | None = None
    refresh_token: str | None = None
    expires_in: int | None = None
    scope: str | None = None
    token_family_id: str | None = None
    error: str | None = None
    error_description: str | None = None

    @property
    def success(self) -> bool:
        return self.error is None

    @property
    def should_wait(self) -> bool:
        return self.error == "authorization_pending"

    @property
    def slow_down(self) -> bool:
        return self.error == "slow_down"


async def create_device_authorization(
    db: AsyncSession,
    client_id: str,
    scope: str | None = None,
    verification_base_uri: str = "http://localhost:1112/device",
) -> tuple[DeviceAuthorization | None, str | None]:
    result = await db.execute(select(Client).where(Client.client_id == client_id))
    client = result.scalar_one_or_none()
    if client is None:
        return None, "invalid_client"
    if not client.is_active:
        return None, "invalid_client"

    device_code = generate_device_code()
    user_code = generate_user_code()

    max_attempts = 10
    for _ in range(max_attempts):
        existing = await db.execute(
            select(DeviceAuthorization).where(DeviceAuthorization.user_code == user_code)
        )
        if existing.scalar_one_or_none() is None:
            break
        user_code = generate_user_code()

    expires_at = _utcnow() + timedelta(seconds=settings.device_authorization_expire_seconds)

    db_device_auth = DeviceAuthorization(
        device_code=device_code,
        user_code=user_code,
        client_id=client_id,
        scope=scope or "read write",
        status="pending",
        expires_at=expires_at.replace(tzinfo=None),
        interval=settings.device_polling_interval,
    )
    db.add(db_device_auth)
    await db.commit()
    await db.refresh(db_device_auth)

    return db_device_auth, None


async def get_device_authorization_by_code(
    db: AsyncSession,
    device_code: str,
) -> DeviceAuthorization | None:
    result = await db.execute(
        select(DeviceAuthorization).where(DeviceAuthorization.device_code == device_code)
    )
    return result.scalar_one_or_none()


async def get_device_authorization_by_user_code(
    db: AsyncSession,
    user_code: str,
) -> DeviceAuthorization | None:
    normalized = user_code.strip().upper().replace("-", "")
    if len(normalized) == 8:
        normalized = normalized[:4] + "-" + normalized[4:]

    result = await db.execute(
        select(DeviceAuthorization).where(DeviceAuthorization.user_code == normalized)
    )
    auth = result.scalar_one_or_none()

    if auth is None:
        result2 = await db.execute(
            select(DeviceAuthorization).where(DeviceAuthorization.user_code == user_code.strip().upper())
        )
        auth = result2.scalar_one_or_none()

    if auth is None:
        result3 = await db.execute(
            select(DeviceAuthorization).where(DeviceAuthorization.user_code == user_code.strip())
        )
        auth = result3.scalar_one_or_none()

    return auth


async def list_device_authorizations(
    db: AsyncSession,
    status_filter: str | None = None,
) -> list[DeviceAuthorization]:
    query = select(DeviceAuthorization).order_by(desc(DeviceAuthorization.created_at))
    if status_filter:
        query = query.where(DeviceAuthorization.status == status_filter)
    result = await db.execute(query)
    items = result.scalars().all()
    return list(items)


async def get_device_authorization_with_details(
    db: AsyncSession,
    auth: DeviceAuthorization,
) -> dict:
    client_name = None
    username = None

    if auth.client_id:
        client_result = await db.execute(
            select(Client).where(Client.client_id == auth.client_id)
        )
        client = client_result.scalar_one_or_none()
        if client:
            client_name = client.name

    if auth.user_id:
        user_result = await db.execute(select(User).where(User.id == auth.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            username = user.username

    return {
        "id": auth.id,
        "device_code": auth.device_code,
        "user_code": auth.user_code,
        "client_id": auth.client_id,
        "client_name": client_name,
        "scope": auth.scope,
        "status": auth.status,
        "user_id": auth.user_id,
        "username": username,
        "expires_at": _to_aware(auth.expires_at),
        "interval": auth.interval,
        "is_used": auth.is_used,
        "created_at": _to_aware(auth.created_at),
        "resolved_at": _to_aware(auth.resolved_at) if auth.resolved_at else None,
    }


async def approve_device_authorization(
    db: AsyncSession,
    device_auth_id: int,
    user_id: int,
) -> tuple[bool, str | None]:
    result = await db.execute(
        select(DeviceAuthorization).where(DeviceAuthorization.id == device_auth_id)
    )
    auth = result.scalar_one_or_none()
    if auth is None:
        return False, "not_found"
    if auth.status != "pending":
        return False, "not_pending"
    if _to_aware(auth.expires_at) < _utcnow():
        return False, "expired"

    auth.status = "approved"
    auth.user_id = user_id
    auth.resolved_at = _utcnow().replace(tzinfo=None)
    await db.commit()
    return True, None


async def deny_device_authorization(
    db: AsyncSession,
    device_auth_id: int,
    user_id: int,
) -> tuple[bool, str | None]:
    result = await db.execute(
        select(DeviceAuthorization).where(DeviceAuthorization.id == device_auth_id)
    )
    auth = result.scalar_one_or_none()
    if auth is None:
        return False, "not_found"
    if auth.status != "pending":
        return False, "not_pending"

    auth.status = "denied"
    auth.user_id = user_id
    auth.resolved_at = _utcnow().replace(tzinfo=None)
    await db.commit()
    return True, None


async def exchange_device_code(
    db: AsyncSession,
    client_id: str,
    client_secret: str,
    device_code: str,
) -> DeviceCodeTokenResult:
    client = await validate_client_credentials(db, client_id, client_secret)
    if client is None:
        return DeviceCodeTokenResult(
            error="invalid_client",
            error_description="Invalid client credentials",
        )

    auth = await get_device_authorization_by_code(db, device_code)
    if auth is None:
        return DeviceCodeTokenResult(
            error="invalid_grant",
            error_description="Invalid device code",
        )

    if auth.client_id != client_id:
        return DeviceCodeTokenResult(
            error="invalid_grant",
            error_description="Device code does not belong to this client",
        )

    if _to_aware(auth.expires_at) < _utcnow():
        return DeviceCodeTokenResult(
            error="expired_token",
            error_description="Device code has expired",
        )

    if auth.is_used:
        return DeviceCodeTokenResult(
            error="invalid_grant",
            error_description="Device code has already been used",
        )

    now = _utcnow()
    if auth.status == "pending" and auth.last_polled_at is not None:
        time_since_last = (now - _to_aware(auth.last_polled_at)).total_seconds()
        if time_since_last < auth.interval:
            auth.last_polled_at = now.replace(tzinfo=None)
            await db.commit()
            return DeviceCodeTokenResult(
                error="slow_down",
                error_description=f"Polling too frequently. Minimum interval is {auth.interval} seconds.",
            )

    auth.last_polled_at = now.replace(tzinfo=None)
    await db.commit()

    if auth.status == "pending":
        return DeviceCodeTokenResult(
            error="authorization_pending",
            error_description="User has not yet authorized the device",
        )

    if auth.status == "denied":
        auth.is_used = True
        await db.commit()
        return DeviceCodeTokenResult(
            error="access_denied",
            error_description="User denied the authorization request",
        )

    if auth.status != "approved":
        return DeviceCodeTokenResult(
            error="invalid_grant",
            error_description="Authorization request is in an invalid state",
        )

    if auth.user_id is None:
        return DeviceCodeTokenResult(
            error="invalid_grant",
            error_description="No user associated with this authorization",
        )

    auth.is_used = True
    await db.commit()

    scope = auth.scope or "read write"
    access_token, refresh_token, expires_in, token_family_id = await create_token_record(
        db, auth.user_id, client_id, scope
    )

    return DeviceCodeTokenResult(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        scope=scope,
        token_family_id=token_family_id,
    )
