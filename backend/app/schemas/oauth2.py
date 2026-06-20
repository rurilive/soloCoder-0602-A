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
    token_family_id: str | None = None


class IntrospectResponse(BaseModel):
    active: bool
    scope: str | None = None
    client_id: str | None = None
    username: str | None = None
    exp: int | None = None
    token_family_id: str | None = None


class DeviceAuthorizationRequest(BaseModel):
    client_id: str
    scope: str | None = None


class DeviceAuthorizationResponse(BaseModel):
    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    expires_in: int
    interval: int


class DeviceCodeTokenRequest(BaseModel):
    grant_type: str = "urn:ietf:params:oauth:grant-type:device_code"
    device_code: str
    client_id: str
    client_secret: str


class DeviceAuthorizationResponseSchema(BaseModel):
    id: int
    device_code: str
    user_code: str
    client_id: str
    client_name: str | None = None
    scope: str
    status: str
    user_id: int | None = None
    username: str | None = None
    expires_at: datetime
    interval: int
    is_used: bool
    created_at: datetime
    resolved_at: datetime | None = None


class UserCodeVerifyRequest(BaseModel):
    user_code: str


class DeviceAuthorizationActionRequest(BaseModel):
    action: str

