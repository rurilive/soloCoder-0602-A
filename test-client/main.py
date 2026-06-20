from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
import httpx
import secrets
import os
from contextlib import asynccontextmanager

SSO_SERVER = "http://localhost:1111"

CLIENT_ID = ""
CLIENT_SECRET = ""
REDIRECT_URI = "http://localhost:8000/callback"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, "app", "templates")
templates = Jinja2Templates(directory=TEMPLATE_DIR)
templates.env.cache = None

sessions: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global CLIENT_ID, CLIENT_SECRET
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SSO_SERVER}/api/clients",
                json={
                    "name": "Test Client App",
                    "description": "用于测试OAuth2.0 SSO的客户端应用",
                    "redirect_uris": "http://localhost:8000/callback",
                    "scope": "read write",
                },
            )
            if response.status_code == 201:
                data = response.json()
                CLIENT_ID = data["client_id"]
                CLIENT_SECRET = data["client_secret"]
                print(f"Registered client: {CLIENT_ID}")
            else:
                print(f"Warning: Could not auto-register client: {response.status_code}")
    except Exception as e:
        print(f"Warning: Could not auto-register client: {e}")
    yield


app = FastAPI(title="OAuth2 Test Client", lifespan=lifespan)


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    session_id = request.cookies.get("session_id")
    user = sessions.get(session_id) if session_id else None

    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "user": user,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "sso_server": SSO_SERVER,
        },
    )


@app.get("/login")
async def login():
    if not CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Client not registered. Please register a client first.",
        )

    state = secrets.token_urlsafe(32)
    auth_url = (
        f"{SSO_SERVER}/authorize"
        f"?response_type=code"
        f"&client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&scope=read write"
        f"&state={state}"
    )
    response = RedirectResponse(url=auth_url)
    response.set_cookie(key="oauth_state", value=state, httponly=True, max_age=600)
    return response


@app.get("/callback")
async def callback(request: Request, code: str = None, state: str = None, error: str = None):
    if error:
        return templates.TemplateResponse(
            request=request,
            name="error.html",
            context={"error": error},
        )

    expected_state = request.cookies.get("oauth_state")
    if not state or state != expected_state:
        return templates.TemplateResponse(
            request=request,
            name="error.html",
            context={"error": "Invalid state parameter"},
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SSO_SERVER}/token",
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": REDIRECT_URI,
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                },
            )
            response.raise_for_status()
            tokens = response.json()

            response2 = await client.get(
                f"{SSO_SERVER}/userinfo",
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            response2.raise_for_status()
            user_info = response2.json()

            session_id = secrets.token_urlsafe(32)
            sessions[session_id] = {
                "user": user_info,
                "tokens": tokens,
            }

            resp = RedirectResponse(url="/")
            resp.set_cookie(key="session_id", value=session_id, httponly=True)
            resp.delete_cookie("oauth_state")
            return resp

    except httpx.HTTPError as e:
        return templates.TemplateResponse(
            request=request,
            name="error.html",
            context={"error": f"Token exchange failed: {str(e)}"},
        )


@app.post("/refresh")
async def refresh_token(request: Request):
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in sessions:
        return RedirectResponse(url="/")

    session = sessions[session_id]
    refresh_token = session["tokens"].get("refresh_token")

    if not refresh_token:
        return templates.TemplateResponse(
            request=request,
            name="error.html",
            context={"error": "No refresh token available"},
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SSO_SERVER}/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                },
            )
            response.raise_for_status()
            new_tokens = response.json()

            sessions[session_id]["tokens"] = new_tokens
            return RedirectResponse(url="/")

    except httpx.HTTPError as e:
        return templates.TemplateResponse(
            request=request,
            name="error.html",
            context={"error": f"Refresh failed: {str(e)}"},
        )


@app.get("/logout")
async def logout(request: Request):
    session_id = request.cookies.get("session_id")
    if session_id and session_id in sessions:
        del sessions[session_id]

    resp = RedirectResponse(url="/")
    resp.delete_cookie("session_id")
    return resp


def start() -> None:
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    start()
