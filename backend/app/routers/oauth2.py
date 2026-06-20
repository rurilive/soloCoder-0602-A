from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
from urllib.parse import urlencode

from ..core import get_db, compute_code_challenge_s256, settings
from ..schemas import (
    TokenRequest,
    TokenResponse,
    IntrospectResponse,
    DeviceAuthorizationResponse,
    DeviceAuthorizationResponseSchema,
    UserCodeVerifyRequest,
    DeviceAuthorizationActionRequest,
    PublicDeviceVerifyResponse,
)
from ..services import (
    get_client_by_id,
    validate_redirect_uri,
    create_authorization_code_record,
    exchange_authorization_code,
    refresh_access_token,
    introspect_token,
    authenticate_user,
    ExchangeCodeResult,
    RefreshTokenResult,
    create_device_authorization,
    exchange_device_code,
    list_device_authorizations,
    get_device_authorization_with_details,
    get_device_authorization_public_details,
    get_device_authorization_by_user_code,
    approve_device_authorization,
    deny_device_authorization,
    DeviceCodeTokenResult,
)
from ..schemas import UserLogin
from .auth import get_current_active_user
from ..models import User

router = APIRouter(tags=["OAuth2"])

BASE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


DEVICE_VERIFICATION_BASE_URI = "http://localhost:1112/device"


@router.get("/authorize", response_class=HTMLResponse)
async def authorize_endpoint(
    request: Request,
    response_type: str,
    client_id: str,
    redirect_uri: str,
    scope: str | None = None,
    state: str | None = None,
    code_challenge: str | None = None,
    code_challenge_method: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if response_type != "code":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported response type. Only 'code' is supported.",
        )

    client = await get_client_by_id(db, client_id)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid client_id",
        )
    if not client.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client is not active",
        )

    if not await validate_redirect_uri(client, redirect_uri):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid redirect_uri",
        )

    if code_challenge and not code_challenge_method:
        code_challenge_method = "S256"

    if code_challenge_method and code_challenge_method not in ("S256", "plain"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid code_challenge_method. Only 'S256' and 'plain' are supported.",
        )

    return templates.TemplateResponse(
        "authorize.html",
        {
            "request": request,
            "client": client,
            "redirect_uri": redirect_uri,
            "scope": scope or "read write",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": code_challenge_method,
        },
    )


@router.post("/authorize/submit")
async def authorize_submit(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    form = await request.form()
    client_id = form.get("client_id")
    redirect_uri = form.get("redirect_uri")
    scope = form.get("scope")
    state = form.get("state")
    username = form.get("username")
    password = form.get("password")
    action = form.get("action")
    code_challenge = form.get("code_challenge") or None
    code_challenge_method = form.get("code_challenge_method") or None

    if not client_id or not redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required parameters",
        )

    if action == "deny":
        params = {"error": "access_denied"}
        if state:
            params["state"] = state
        return RedirectResponse(
            url=f"{redirect_uri}?{urlencode(params)}",
            status_code=status.HTTP_302_FOUND,
        )

    user_login = UserLogin(username=username, password=password)
    db_user = await authenticate_user(db, user_login)
    if db_user is None:
        client = await get_client_by_id(db, client_id)
        return templates.TemplateResponse(
            "authorize.html",
            {
                "request": request,
                "client": client,
                "redirect_uri": redirect_uri,
                "scope": scope or "read write",
                "state": state,
                "code_challenge": code_challenge,
                "code_challenge_method": code_challenge_method,
                "error": "Invalid username or password",
            },
        )

    auth_code = await create_authorization_code_record(
        db,
        client_id,
        db_user.id,
        redirect_uri,
        scope,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
    )

    params = {"code": auth_code.code}
    if state:
        params["state"] = state

    return RedirectResponse(
        url=f"{redirect_uri}?{urlencode(params)}",
        status_code=status.HTTP_302_FOUND,
    )


@router.post("/device_authorization", response_model=DeviceAuthorizationResponse)
async def device_authorization_endpoint(
    client_id: str = Form(...),
    scope: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
) -> DeviceAuthorizationResponse:
    result, error = await create_device_authorization(
        db, client_id, scope, verification_base_uri=DEVICE_VERIFICATION_BASE_URI
    )

    if error == "invalid_client":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid client_id",
            headers={"WWW-Authenticate": "Bearer"},
        )

    assert result is not None

    user_code_for_url = result.user_code.replace("-", "")

    return DeviceAuthorizationResponse(
        device_code=result.device_code,
        user_code=result.user_code,
        verification_uri=DEVICE_VERIFICATION_BASE_URI,
        verification_uri_complete=f"{DEVICE_VERIFICATION_BASE_URI}?user_code={user_code_for_url}",
        expires_in=settings.device_authorization_expire_seconds,
        interval=result.interval,
    )


@router.post("/token")
async def token_endpoint(
    grant_type: str = Form(...),
    code: str | None = Form(None),
    redirect_uri: str | None = Form(None),
    client_id: str = Form(...),
    client_secret: str = Form(...),
    refresh_token: str | None = Form(None),
    code_verifier: str | None = Form(None),
    device_code: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    if grant_type == "authorization_code":
        if not code or not redirect_uri:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing code or redirect_uri for authorization_code grant",
            )

        result = await exchange_authorization_code(
            db, client_id, client_secret, code, redirect_uri, code_verifier
        )

        if not result.success:
            error_map = {
                "invalid_grant": "Invalid authorization code or client credentials",
                "pkce_verifier_missing": "PKCE verification failed: code_verifier is required but was not provided",
                "pkce_verification_failed": "PKCE verification failed: code_verifier does not match code_challenge",
            }
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_map.get(result.error, "Authorization code exchange failed"),
            )

        return TokenResponse(
            access_token=result.access_token,
            refresh_token=result.refresh_token,
            expires_in=result.expires_in,
            scope=result.scope,
            token_family_id=result.token_family_id,
        )

    elif grant_type == "refresh_token":
        if not refresh_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing refresh_token for refresh_token grant",
            )

        result = await refresh_access_token(
            db, client_id, client_secret, refresh_token
        )

        if not result.success:
            error_map = {
                "invalid_client": "Invalid client credentials",
                "invalid_token": "Invalid or expired refresh token",
                "replay_detected": "Replay attack detected: refresh token has been revoked. All tokens in this family have been invalidated.",
            }
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_map.get(result.error, "Invalid refresh token or client credentials"),
            )

        return TokenResponse(
            access_token=result.access_token,
            refresh_token=result.refresh_token,
            expires_in=result.expires_in,
            scope=result.scope,
            token_family_id=result.token_family_id,
        )

    elif grant_type == "urn:ietf:params:oauth:grant-type:device_code":
        if not device_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing device_code for device_code grant",
            )

        result: DeviceCodeTokenResult = await exchange_device_code(
            db, client_id, client_secret, device_code
        )

        if not result.success:
            if result.error == "authorization_pending":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": "authorization_pending",
                        "error_description": "User has not yet authorized the device",
                    },
                )
            elif result.error == "slow_down":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": "slow_down",
                        "error_description": result.error_description,
                    },
                )
            elif result.error == "access_denied":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": "access_denied",
                        "error_description": "User denied the authorization request",
                    },
                )
            elif result.error == "expired_token":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": "expired_token",
                        "error_description": "The device_code has expired",
                    },
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": result.error or "invalid_grant",
                        "error_description": result.error_description or "Device code exchange failed",
                    },
                )

        return TokenResponse(
            access_token=result.access_token,
            refresh_token=result.refresh_token,
            expires_in=result.expires_in,
            scope=result.scope,
            token_family_id=result.token_family_id,
        )

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unsupported grant type. "
                "Only 'authorization_code', 'refresh_token', and "
                "'urn:ietf:params:oauth:grant-type:device_code' are supported."
            ),
        )


@router.get("/api/device_authorizations", response_model=list[DeviceAuthorizationResponseSchema])
async def list_device_authorizations_endpoint(
    status: str | None = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[DeviceAuthorizationResponseSchema]:
    items = await list_device_authorizations(db, status_filter=status)
    result = []
    for auth in items:
        details = await get_device_authorization_with_details(db, auth)
        result.append(DeviceAuthorizationResponseSchema(**details))
    return result


@router.post("/api/device_authorizations/{auth_id}/approve")
async def approve_device_authorization_endpoint(
    auth_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    success, error = await approve_device_authorization(db, auth_id, current_user.id)
    if not success:
        error_map = {
            "not_found": ("Device authorization not found", status.HTTP_404_NOT_FOUND),
            "not_pending": ("Device authorization is not in pending state", status.HTTP_400_BAD_REQUEST),
            "expired": ("Device authorization has expired", status.HTTP_400_BAD_REQUEST),
        }
        message, http_status = error_map.get(error, ("Failed to approve", status.HTTP_400_BAD_REQUEST))
        raise HTTPException(status_code=http_status, detail=message)
    return {"status": "approved", "id": auth_id}


@router.post("/api/device_authorizations/{auth_id}/deny")
async def deny_device_authorization_endpoint(
    auth_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    success, error = await deny_device_authorization(db, auth_id, current_user.id)
    if not success:
        error_map = {
            "not_found": ("Device authorization not found", status.HTTP_404_NOT_FOUND),
            "not_pending": ("Device authorization is not in pending state", status.HTTP_400_BAD_REQUEST),
        }
        message, http_status = error_map.get(error, ("Failed to deny", status.HTTP_400_BAD_REQUEST))
        raise HTTPException(status_code=http_status, detail=message)
    return {"status": "denied", "id": auth_id}


@router.post("/api/public/device_verify", response_model=PublicDeviceVerifyResponse)
async def public_device_verify(
    request: UserCodeVerifyRequest,
    db: AsyncSession = Depends(get_db),
) -> PublicDeviceVerifyResponse:
    auth = await get_device_authorization_by_user_code(db, request.user_code)
    if auth is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User code not found or invalid",
        )

    if auth.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User code has already been {auth.status}",
        )

    now = datetime.now(timezone.utc)
    expires_aware = auth.expires_at.replace(tzinfo=timezone.utc) if auth.expires_at.tzinfo is None else auth.expires_at
    if expires_aware < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User code has expired",
        )

    details = await get_device_authorization_public_details(db, auth)
    return PublicDeviceVerifyResponse(**details)


@router.post("/introspect", response_model=IntrospectResponse)
async def introspect_endpoint(
    token: str = Form(...),
    token_type_hint: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
) -> IntrospectResponse:
    result = await introspect_token(db, token, token_type_hint)
    return IntrospectResponse(**result)


@router.get("/userinfo")
async def userinfo_endpoint(
    current_user: User = Depends(get_current_active_user),
) -> dict:
    return {
        "sub": str(current_user.id),
        "username": current_user.username,
        "email": current_user.email,
    }


@router.get("/.well-known/pkce-challenge", tags=["Debug"])
async def pkce_challenge_endpoint(code_verifier: str, method: str = "S256"):
    try:
        if method == "S256":
            challenge = compute_code_challenge_s256(code_verifier)
        elif method == "plain":
            challenge = code_verifier
        else:
            raise HTTPException(status_code=400, detail="Invalid method")
        return {"code_verifier": code_verifier, "code_challenge": challenge, "method": method}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
