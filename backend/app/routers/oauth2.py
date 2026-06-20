from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path

from ..core import get_db, compute_code_challenge_s256
from ..schemas import (
    TokenRequest,
    TokenResponse,
    IntrospectResponse,
)
from ..services import (
    get_client_by_id,
    validate_redirect_uri,
    create_authorization_code_record,
    exchange_authorization_code,
    refresh_access_token,
    introspect_token,
    authenticate_user,
)
from ..schemas import UserLogin
from .auth import get_current_active_user
from ..models import User

router = APIRouter(tags=["OAuth2"])

BASE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


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
        from urllib.parse import urlencode
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

    from urllib.parse import urlencode
    params = {"code": auth_code.code}
    if state:
        params["state"] = state

    return RedirectResponse(
        url=f"{redirect_uri}?{urlencode(params)}",
        status_code=status.HTTP_302_FOUND,
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
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid authorization code, client credentials, or PKCE verification failed",
            )

        access_token, refresh_token_val, expires_in, scope, token_family_id = result
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token_val,
            expires_in=expires_in,
            scope=scope,
            token_family_id=token_family_id,
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
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid refresh token or client credentials",
            )

        new_access_token, new_refresh_token, expires_in, scope, token_family_id, replay_detected = result

        if replay_detected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Replay attack detected: refresh token has been revoked. All tokens in this family have been invalidated.",
            )

        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            expires_in=expires_in,
            scope=scope,
            token_family_id=token_family_id,
        )

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported grant type. Only 'authorization_code' and 'refresh_token' are supported.",
        )


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
