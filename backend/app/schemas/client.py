from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class ClientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    redirect_uris: str = Field(..., description="Multiple URIs separated by spaces")
    scope: str = "read write"


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    redirect_uris: str | None = None
    scope: str | None = None
    is_active: bool | None = None


class ClientResponse(BaseModel):
    id: int
    client_id: str
    client_secret: str | None = None
    name: str
    description: str | None
    redirect_uris: str
    scope: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ClientPublicResponse(BaseModel):
    client_id: str
    name: str
    description: str | None

    class Config:
        from_attributes = True
