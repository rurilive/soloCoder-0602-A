from typing import Sequence
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core import get_db
from ..schemas import ClientCreate, ClientUpdate, ClientResponse
from ..services import (
    create_client,
    get_client_by_id,
    list_clients,
    update_client,
    delete_client,
)

router = APIRouter(prefix="/api/clients", tags=["Clients"])


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client_endpoint(
    client_in: ClientCreate, db: AsyncSession = Depends(get_db)
) -> ClientResponse:
    db_client = await create_client(db, client_in)
    return ClientResponse.model_validate(db_client)


@router.get("", response_model=list[ClientResponse])
async def list_clients_endpoint(
    skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)
) -> Sequence[ClientResponse]:
    clients = await list_clients(db, skip, limit)
    result = []
    for c in clients:
        resp = ClientResponse.model_validate(c)
        resp.client_secret = None
        result.append(resp)
    return result


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client_endpoint(
    client_id: str, db: AsyncSession = Depends(get_db)
) -> ClientResponse:
    db_client = await get_client_by_id(db, client_id)
    if db_client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )
    resp = ClientResponse.model_validate(db_client)
    resp.client_secret = None
    return resp


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client_endpoint(
    client_id: str,
    client_in: ClientUpdate,
    db: AsyncSession = Depends(get_db),
) -> ClientResponse:
    db_client = await update_client(db, client_id, client_in)
    if db_client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )
    resp = ClientResponse.model_validate(db_client)
    resp.client_secret = None
    return resp


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client_endpoint(
    client_id: str, db: AsyncSession = Depends(get_db)
) -> None:
    deleted = await delete_client(db, client_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )
