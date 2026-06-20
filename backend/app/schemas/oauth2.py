from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class AuthorizationRequest(BaseModel):
    response_type: str = Field(..., pattern="code")
    client_id: str
    redirect_uri: str
    scope: str | None = None
    state: str | None = None


class TokenRequest(BaseModel):
    grant_type: str
    code: str | None = None
    redirect_uri: str | None = None
    client_id: str
    client_secret: str
    refresh_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    refresh_token: str | None = None
    scope: str


class IntrospectResponse(BaseModel):
    active: bool
    scope: str | None = None
    client_id: str | None = None
    username: str | None = None
    exp: int | None = None
