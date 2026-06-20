import asyncio
import httpx
from datetime import datetime, timezone


BACKEND = "http://localhost:1111"


async def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")


async def main():
    async with httpx.AsyncClient() as client:
        await log("=== Step 1: 注册并登录用户 ===")
        try:
            r = await client.post(
                f"{BACKEND}/api/auth/register",
                json={
                    "username": "revoketest",
                    "email": "revoketest@example.com",
                    "password": "testpass123",
                },
            )
            await log(f"注册: {r.status_code} - {r.text[:100]}")
        except Exception as e:
            await log(f"注册(可能已存在): {e}")

        r = await client.post(
            f"{BACKEND}/api/auth/login",
            data={"username": "revoketest", "password": "testpass123"},
        )
        await log(f"登录: {r.status_code} - {r.text[:200]}")
        assert r.status_code == 200, f"登录失败: {r.text}"
        login_token = r.json()["access_token"]
        await log(f"登录 Token (前30字符): {login_token[:30]}...")

        await log("\n=== Step 2: 创建一个 OAuth2 客户端 ===")
        r = await client.post(
            f"{BACKEND}/api/clients",
            json={
                "name": "Revoke Test Client",
                "redirect_uris": "http://localhost:1112/test",
                "scope": "read write",
            },
            headers={"Authorization": f"Bearer {login_token}"},
        )
        await log(f"创建客户端: {r.status_code} - {r.text[:300]}")
        assert r.status_code == 201, f"创建客户端失败: {r.text}"
        client_data = r.json()
        client_id = client_data["client_id"]
        client_secret = client_data["client_secret"]
        await log(f"Client ID: {client_id}")
        await log(f"Client Secret: {client_secret}")

        await log("\n=== Step 3: 使用后端的 device flow 或直接获取 Token ===")
        r = await client.post(
            f"{BACKEND}/device_authorization",
            data={"client_id": client_id, "scope": "read write"},
        )
        await log(f"Device Authorization: {r.status_code} - {r.text[:200]}")
        assert r.status_code == 200, f"Device auth 失败: {r.text}"
        device_auth = r.json()
        device_code = device_auth["device_code"]
        user_code = device_auth["user_code"]
        user_code_normalized = user_code.replace("-", "")
        await log(f"Device Code: {device_code[:30]}...")
        await log(f"User Code: {user_code}")

        r = await client.post(
            f"{BACKEND}/api/public/device_verify",
            json={"user_code": user_code_normalized},
        )
        await log(f"获取 device auth id: {r.status_code}")
        auth_id = r.json()["id"]

        r = await client.post(
            f"{BACKEND}/api/device_authorizations/{auth_id}/approve",
            headers={"Authorization": f"Bearer {login_token}"},
        )
        await log(f"Approve device auth: {r.status_code} - {r.text[:100]}")

        await asyncio.sleep(1)

        r = await client.post(
            f"{BACKEND}/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": device_code,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        await log(f"获取 Token: {r.status_code} - {r.text[:300]}")
        assert r.status_code == 200, f"获取 Token 失败: {r.text}"
        token_data = r.json()
        access_token = token_data["access_token"]
        refresh_token = token_data["refresh_token"]
        token_family_id = token_data.get("token_family_id")
        await log(f"Access Token (前30): {access_token[:30]}...")
        await log(f"Refresh Token (前30): {refresh_token[:30]}...")
        await log(f"Token Family ID: {token_family_id}")

        await log("\n=== Step 4: 验证 Token 有效 ===")
        r = await client.get(
            f"{BACKEND}/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        await log(f"未撤销前 /userinfo: {r.status_code} - {r.text[:200]}")
        assert r.status_code == 200, f"Token 应该有效: {r.text}"

        r = await client.post(
            f"{BACKEND}/introspect",
            data={"token": access_token, "token_type_hint": "access"},
        )
        await log(f"未撤销前内省 access: {r.status_code} - {r.text[:200]}")
        assert r.json()["active"] == True, "Access token 应该 active"

        r = await client.post(
            f"{BACKEND}/introspect",
            data={"token": refresh_token, "token_type_hint": "refresh"},
        )
        await log(f"未撤销前内省 refresh: {r.status_code} - {r.text[:200]}")
        assert r.json()["active"] == True, "Refresh token 应该 active"

        r = await client.post(
            f"{BACKEND}/introspect",
            data={"token": access_token, "token_type_hint": "access_token"},
        )
        await log(f"introspect token_type_hint=access_token (应active): {r.status_code} - {r.text[:200]}")
        assert r.json()["active"] == True, "access_token hint 应该能正常映射到 access"

        r = await client.post(
            f"{BACKEND}/introspect",
            data={"token": refresh_token, "token_type_hint": "refresh_token"},
        )
        await log(f"introspect token_type_hint=refresh_token (应active): {r.status_code} - {r.text[:200]}")
        assert r.json()["active"] == True, "refresh_token hint 应该能正常映射到 refresh"

        await log("\n=== Step 5: 测试 RFC7009 合规性 ===")
        r = await client.post(
            f"{BACKEND}/revoke",
            data={
                "token": access_token,
                "token_type_hint": "access_token",
                "client_id": "wrong_client",
                "client_secret": "wrong_secret",
            },
        )
        await log(f"错误客户端凭证撤销: {r.status_code} - {r.text[:200]}")
        assert r.status_code == 401, f"错误客户端凭证应该 401: {r.text}"

        r = await client.post(
            f"{BACKEND}/revoke",
            data={
                "token": "invalid.token.here",
                "token_type_hint": "access_token",
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        await log(f"撤销无效 token (应200): {r.status_code} - {r.text[:200]}")
        assert r.status_code == 200, f"撤销无效 token 应返回 200 (RFC7009): {r.text}"
        assert r.json()["revoked_count"] == 0, "revoked_count 应为 0"

        r = await client.post(
            f"{BACKEND}/revoke",
            data={
                "token": access_token,
                "token_type_hint": "wrong_type",
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        await log(f"unsupported_token_type (应400): {r.status_code} - {r.text[:200]}")
        assert r.status_code == 400, f"unsupported_token_type 应返回 400: {r.text}"

        await log("\n=== Step 6: 撤销 Access Token 并验证 ===")
        r = await client.post(
            f"{BACKEND}/revoke",
            data={
                "token": access_token,
                "token_type_hint": "access_token",
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        await log(f"撤销 Access Token: {r.status_code} - {r.text[:200]}")
        assert r.status_code == 200, f"撤销失败: {r.text}"
        assert r.json()["revoked"] == True

        r = await client.get(
            f"{BACKEND}/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        await log(f"撤销后 /userinfo (应401): {r.status_code} - {r.text[:200]}")
        assert r.status_code == 401, f"撤销后应该 401: {r.text}"

        r = await client.post(
            f"{BACKEND}/introspect",
            data={"token": access_token, "token_type_hint": "access"},
        )
        await log(f"撤销后内省 access (应false): {r.status_code} - {r.text[:200]}")
        assert r.json()["active"] == False, "撤销后应该 inactive"

        r = await client.post(
            f"{BACKEND}/revoke",
            data={
                "token": access_token,
                "token_type_hint": "access_token",
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        await log(f"重复撤销已撤销的 access (应200, count=0): {r.status_code} - {r.text[:200]}")
        assert r.status_code == 200, f"重复撤销应返回 200 (RFC7009): {r.text}"
        assert r.json()["revoked_count"] == 0, "重复撤销 revoked_count 应为 0"

        await log("\n✅ Access Token 撤销功能验证通过!")

        await log("\n=== Step 7: 重新获取 Token，测试 Refresh Token 撤销 ===")
        r = await client.post(
            f"{BACKEND}/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        await log(f"刷新获取新 Token: {r.status_code} - {r.text[:200]}")
        assert r.status_code == 200, f"刷新失败: {r.text}"
        token_data2 = r.json()
        access_token2 = token_data2["access_token"]
        refresh_token2 = token_data2["refresh_token"]
        token_family_id2 = token_data2.get("token_family_id")
        await log(f"新 Token Family ID: {token_family_id2}")
        assert token_family_id2 == token_family_id, "应该属于同一个 token family"

        r = await client.get(
            f"{BACKEND}/userinfo",
            headers={"Authorization": f"Bearer {access_token2}"},
        )
        await log(f"新 Access Token 验证: {r.status_code} - {r.text[:100]}")
        assert r.status_code == 200

        await log("\n=== Step 8: 撤销 Refresh Token (全族撤销) 并验证 ===")
        r = await client.post(
            f"{BACKEND}/revoke",
            data={
                "token": refresh_token2,
                "token_type_hint": "refresh_token",
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        await log(f"撤销 Refresh Token: {r.status_code} - {r.text[:200]}")
        assert r.status_code == 200, f"撤销 Refresh 失败: {r.text}"
        assert r.json()["revoked"] == True
        await log(f"撤销数量: {r.json()['revoked_count']}")

        r = await client.get(
            f"{BACKEND}/userinfo",
            headers={"Authorization": f"Bearer {access_token2}"},
        )
        await log(f"撤销 Refresh 后 Access Token /userinfo (应401): {r.status_code} - {r.text[:200]}")
        assert r.status_code == 401, f"撤销 refresh 后 access 应该失效(401): {r.text}"

        r = await client.post(
            f"{BACKEND}/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token2,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        await log(f"撤销后尝试用 Refresh Token 刷新 (应400): {r.status_code} - {r.text[:200]}")
        assert r.status_code == 400, f"撤销后刷新应该失败: {r.text}"

        r = await client.post(
            f"{BACKEND}/introspect",
            data={"token": refresh_token2, "token_type_hint": "refresh"},
        )
        await log(f"撤销后内省 refresh (应false): {r.status_code} - {r.text[:200]}")
        assert r.json()["active"] == False

        await log("\n✅ Refresh Token 撤销 + 全族失效 验证通过!")

        await log("\n🎉 所有 Token 撤销测试通过!")


if __name__ == "__main__":
    asyncio.run(main())
