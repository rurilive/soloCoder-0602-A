from typing import Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Client
from ..schemas import ClientCreate, ClientUpdate
from ..core import generate_client_id, generate_client_secret, get_password_hash


async def create_client(db: AsyncSession, client_in: ClientCreate) -> Client:
    client_id = generate_client_id()
    client_secret = generate_client_secret()
    hashed_secret = get_password_hash(client_secret)

    db_client = Client(
        client_id=client_id,
        client_secret=hashed_secret,
        name=client_in.name,
        description=client_in.description,
        redirect_uris=client_in.redirect_uris,
        scope=client_in.scope,
    )
    db.add(db_client)
    await db.commit()
    await db.refresh(db_client)

    db_client.client_secret = client_secret
    return db_client


async def get_client_by_id(db: AsyncSession, client_id: str) -> Client | None:
    result = await db.execute(select(Client).where(Client.client_id == client_id))
    return result.scalar_one_or_none()


async def get_client_by_id_raw(db: AsyncSession, client_id: str) -> Client | None:
    result = await db.execute(select(Client).where(Client.client_id == client_id))
    return result.scalar_one_or_none()


async def list_clients(db: AsyncSession, skip: int = 0, limit: int = 100) -> Sequence[Client]:
    result = await db.execute(select(Client).offset(skip).limit(limit))
    return result.scalars().all()


async def update_client(
    db: AsyncSession, client_id: str, client_in: ClientUpdate
) -> Client | None:
    db_client = await get_client_by_id(db, client_id)
    if db_client is None:
        return None

    update_data = client_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_client, field, value)

    await db.commit()
    await db.refresh(db_client)
    return db_client


async def delete_client(db: AsyncSession, client_id: str) -> bool:
    db_client = await get_client_by_id(db, client_id)
    if db_client is None:
        return False

    await db.delete(db_client)
    await db.commit()
    return True


async def validate_client_credentials(
    db: AsyncSession, client_id: str, client_secret: str
) -> Client | None:
    db_client = await get_client_by_id_raw(db, client_id)
    if db_client is None:
        return None
    if not db_client.is_active:
        return None
    if not verify_password(client_secret, db_client.client_secret):
        return None
    return db_client


def verify_password(plain_password: str, hashed_password: str) -> bool:
    import bcrypt
    try:
        password_bytes = plain_password.encode("utf-8")
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except (ValueError, TypeError):
        return False


async def validate_redirect_uri(client: Client, redirect_uri: str) -> bool:
    allowed_uris = client.redirect_uris.split()
    return redirect_uri in allowed_uris
