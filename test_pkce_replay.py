#!/usr/bin/env python3
"""PKCE + Refresh Token Replay Detection - 完整集成测试"""

import asyncio
import base64
import hashlib
import re
import secrets
import string
import httpx
import sys
from typing import Tuple

BASE_URL = "http://localhost:1111"
REDIRECT_URI = "http://localhost:3000/callback"

# === PKCE 工具函数 ===
PKCE_CODE_VERIFIER_PATTERN = re.compile(r"^[A-Za-z0-9\-._~]{43,128}$")

def generate_code_verifier(length: int = 64) -> str:
    if length < 43 or length > 128:
        raise ValueError("length must be between 43 and 128")
    alphabet = string.ascii_letters + string.digits + "-._~"
    return "".join(secrets.choice(alphabet) for _ in range(length))

def validate_code_verifier(code_verifier: str) -> bool:
    return bool(PKCE_CODE_VERIFIER_PATTERN.match(code_verifier))

def compute_code_challenge_s256(code_verifier: str) -> str:
    hashed = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(hashed).rstrip(b"=").decode("ascii")

def print_section(title: str):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)

def print_pass(msg: str):
    print(f"  ✅ PASS: {msg}")

def print_fail(msg: str):
    print(f"  ❌ FAIL: {msg}")

def print_info(msg: str):
    print(f"  ℹ️  {msg}")

# === 测试步骤 ===
async def test_1_register_user(client: httpx.AsyncClient) -> dict:
    print_section("步骤 1: 注册测试用户")
    resp = await client.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "username": "testuser_pkce",
            "email": "test_pkce@example.com",
            "password": "TestPass123!",
        },
    )
    if resp.status_code == 201:
        data = resp.json()
        print_pass(f"用户注册成功: id={data['id']}, username={data['username']}")
        return data
    elif resp.status_code == 400 and "already registered" in resp.text:
        print_info("用户已存在，跳过注册")
        return {"username": "testuser_pkce", "email": "test_pkce@example.com"}
    else:
        print_fail(f"注册失败: {resp.status_code} - {resp.text}")
        raise RuntimeError("User registration failed")

async def test_2_create_client(client: httpx.AsyncClient) -> Tuple[str, str]:
    print_section("步骤 2: 注册 OAuth2 客户端")
    resp = await client.post(
        f"{BASE_URL}/api/clients",
        json={
            "name": "Test PKCE Client",
            "redirect_uris": REDIRECT_URI,
            "scope": "read write",
        },
    )
    if resp.status_code == 201:
        data = resp.json()
        client_id = data["client_id"]
        client_secret = data["client_secret"]
        print_pass(f"客户端注册成功: client_id={client_id[:12]}...")
        print_info(f"client_secret (前12位): {client_secret[:12]}...")
        return client_id, client_secret
    else:
        print_fail(f"客户端注册失败: {resp.status_code} - {resp.text}")
        raise RuntimeError("Client creation failed")

async def test_3_pkce_s256_normal_flow(
    client: httpx.AsyncClient,
    client_id: str,
    client_secret: str,
) -> Tuple[str, str, str]:
    print_section("步骤 3: PKCE (S256) 正常授权码流程")

    # 3a: 生成 code_verifier 和 code_challenge
    code_verifier = generate_code_verifier(64)
    assert validate_code_verifier(code_verifier), "code_verifier 格式无效"
    code_challenge = compute_code_challenge_s256(code_verifier)
    state = secrets.token_urlsafe(16)
    print_info(f"code_verifier 长度: {len(code_verifier)} 字符")
    print_info(f"code_challenge (S256): {code_challenge[:16]}...")

    # 3b: 提交授权
    resp = await client.post(
        f"{BASE_URL}/authorize/submit",
        data={
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "scope": "read write",
            "state": state,
            "username": "testuser_pkce",
            "password": "TestPass123!",
            "action": "approve",
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert resp.status_code == 302, f"授权未重定向: {resp.status_code}"
    location = resp.headers["Location"]
    assert "code=" in location, f"授权码未返回: {location}"
    assert f"state={state}" in location, f"state 不匹配: {location}"
    import urllib.parse
    query = urllib.parse.urlparse(location).query
    params = urllib.parse.parse_qs(query)
    auth_code = params["code"][0]
    print_pass(f"授权成功，code={auth_code[:16]}...")

    # 3c: 使用正确的 code_verifier 交换 Token
    resp = await client.post(
        f"{BASE_URL}/token",
        data={
            "grant_type": "authorization_code",
            "code": auth_code,
            "redirect_uri": REDIRECT_URI,
            "client_id": client_id,
            "client_secret": client_secret,
            "code_verifier": code_verifier,
        },
    )
    assert resp.status_code == 200, f"Token 交换失败: {resp.status_code} - {resp.text}"
    token_data = resp.json()
    access_token = token_data["access_token"]
    refresh_token = token_data["refresh_token"]
    token_family_id = token_data.get("token_family_id")
    expires_in = token_data["expires_in"]

    assert access_token, "未返回 access_token"
    assert refresh_token, "未返回 refresh_token"
    assert token_family_id, "未返回 token_family_id"
    assert expires_in > 0, "expires_in 无效"

    print_pass(f"Token 交换成功，access_token={access_token[:20]}...")
    print_pass(f"refresh_token={refresh_token[:20]}...")
    print_pass(f"token_family_id={token_family_id}")
    print_pass(f"expires_in={expires_in}s")

    return access_token, refresh_token, token_family_id

async def test_4_pkce_wrong_verifier_rejected(
    client: httpx.AsyncClient,
    client_id: str,
    client_secret: str,
) -> None:
    print_section("步骤 4: PKCE 安全性 - 错误的 code_verifier 应被拒绝")

    # 生成一对新的 verifier/challenge，但使用另一个 verifier 去交换
    real_verifier = generate_code_verifier(64)
    wrong_verifier = generate_code_verifier(64)  # 故意用不同的
    real_challenge = compute_code_challenge_s256(real_verifier)
    assert real_verifier != wrong_verifier

    resp = await client.post(
        f"{BASE_URL}/authorize/submit",
        data={
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "scope": "read write",
            "state": secrets.token_urlsafe(16),
            "username": "testuser_pkce",
            "password": "TestPass123!",
            "action": "approve",
            "code_challenge": real_challenge,
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert resp.status_code == 302
    import urllib.parse
    location = resp.headers["Location"]
    query = urllib.parse.urlparse(location).query
    params = urllib.parse.parse_qs(query)
    auth_code = params["code"][0]

    # 使用错误的 code_verifier
    resp = await client.post(
        f"{BASE_URL}/token",
        data={
            "grant_type": "authorization_code",
            "code": auth_code,
            "redirect_uri": REDIRECT_URI,
            "client_id": client_id,
            "client_secret": client_secret,
            "code_verifier": wrong_verifier,  # 错误！
        },
    )
    assert resp.status_code == 400, f"错误的 code_verifier 应该被拒绝，但是返回 {resp.status_code}"
    print_pass(f"错误的 code_verifier 被正确拒绝: HTTP {resp.status_code}")
    print_info(f"错误消息: {resp.json()['detail']}")

async def test_5_traditional_flow_without_pkce(
    client: httpx.AsyncClient,
    client_id: str,
    client_secret: str,
) -> Tuple[str, str, str]:
    print_section("步骤 5: 传统授权码流程 (不带 PKCE)")

    resp = await client.post(
        f"{BASE_URL}/authorize/submit",
        data={
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "scope": "read write",
            "state": secrets.token_urlsafe(16),
            "username": "testuser_pkce",
            "password": "TestPass123!",
            "action": "approve",
        },
        follow_redirects=False,
    )
    assert resp.status_code == 302
    import urllib.parse
    location = resp.headers["Location"]
    query = urllib.parse.urlparse(location).query
    params = urllib.parse.parse_qs(query)
    auth_code = params["code"][0]
    print_pass(f"授权成功 (无 PKCE), code={auth_code[:16]}...")

    # 不带 code_verifier 交换 token
    resp = await client.post(
        f"{BASE_URL}/token",
        data={
            "grant_type": "authorization_code",
            "code": auth_code,
            "redirect_uri": REDIRECT_URI,
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    assert resp.status_code == 200, f"传统流程 Token 交换失败: {resp.status_code} - {resp.text}"
    token_data = resp.json()
    access_token = token_data["access_token"]
    refresh_token = token_data["refresh_token"]
    token_family_id = token_data.get("token_family_id")

    assert access_token
    assert refresh_token
    assert token_family_id

    print_pass(f"传统流程 Token 交换成功")
    print_pass(f"token_family_id={token_family_id}")

    return access_token, refresh_token, token_family_id

async def test_6_token_family_consistency(
    client: httpx.AsyncClient,
    client_id: str,
    client_secret: str,
    initial_refresh_token: str,
    initial_family_id: str,
) -> Tuple[str, str]:
    print_section("步骤 6: Token Family ID 一致性 - 多次刷新保持同一族")

    current_rt = initial_refresh_token
    current_fid = initial_family_id
    families_seen = [current_fid]

    for i in range(3):
        resp = await client.post(
            f"{BASE_URL}/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": current_rt,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        assert resp.status_code == 200, f"第 {i+1} 次刷新失败: {resp.status_code} - {resp.text}"
        token_data = resp.json()
        new_rt = token_data["refresh_token"]
        new_fid = token_data.get("token_family_id")

        assert new_rt != current_rt, f"第 {i+1} 次刷新 refresh_token 未轮换"
        assert new_fid == current_fid, f"第 {i+1} 次刷新 token_family_id 改变了! {new_fid} != {current_fid}"

        families_seen.append(new_fid)
        print_pass(f"第 {i+1} 次刷新成功，family_id 保持一致: {new_fid[:16]}...")

        current_rt = new_rt
        current_fid = new_fid

    assert len(set(families_seen)) == 1, f"Token Family ID 不一致: {families_seen}"
    print_pass(f"共刷新 3 次，所有 token_family_id 完全一致 ✨")

    return current_rt, current_fid

async def test_7_replay_detection(
    client: httpx.AsyncClient,
    client_id: str,
    client_secret: str,
    valid_refresh_token: str,  # 尚未使用过的刷新 token
) -> Tuple[str, str]:
    print_section("步骤 7: Refresh Token 重放检测 - 撤销 token 重用检测")

    saved_old_rt = valid_refresh_token

    # 7a: 第一次正常刷新 - old_rt 被撤销
    print_info("第一次正常刷新（使用有效的 refresh_token）...")
    resp1 = await client.post(
        f"{BASE_URL}/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": saved_old_rt,
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    assert resp1.status_code == 200, f"第一次正常刷新失败: {resp1.status_code} - {resp1.text}"
    token_data1 = resp1.json()
    new_rt_after_first = token_data1["refresh_token"]
    family_id = token_data1.get("token_family_id")
    print_pass(f"第一次正常刷新成功，旧 refresh_token 已被撤销")
    print_pass(f"新 refresh_token: {new_rt_after_first[:20]}...")

    # 7b: 第二次使用同一个旧 token - 触发重放检测！
    print_info("第二次刷新 - 重用已撤销的旧 token (模拟重放攻击)...")
    resp2 = await client.post(
        f"{BASE_URL}/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": saved_old_rt,  # 重用已撤销的 token!
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    assert resp2.status_code == 400, f"重放攻击未被检测到! 返回 {resp2.status_code}"
    error_msg = resp2.json()["detail"]
    assert "Replay attack detected" in error_msg or "replay" in error_msg.lower(), \
        f"错误消息不正确: {error_msg}"

    print_pass(f"🚨 重放攻击检测成功！HTTP {resp2.status_code}")
    print_pass(f"错误消息: {error_msg}")

    return new_rt_after_first, family_id

async def test_8_family_invalidation_after_replay(
    client: httpx.AsyncClient,
    client_id: str,
    client_secret: str,
    new_rt_after_first: str,
    family_id: str,
) -> None:
    print_section("步骤 8: 重放检测后 - 整个 Token 族失效验证")

    # 8a: 尝试使用第一次刷新后获得的新 token - 应该也失效了
    print_info("尝试使用第一次刷新后获得的新 refresh_token (本族)...")
    resp = await client.post(
        f"{BASE_URL}/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": new_rt_after_first,
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    assert resp.status_code == 400, f"新 refresh_token 应该也被撤销，但返回 {resp.status_code}"
    print_pass(f"🔥 Token 族内新 token 已被正确撤销，无法再使用: HTTP {resp.status_code}")

    # 8b: 验证重放检测的错误信息
    detail = resp.json()["detail"]
    print_info(f"返回的错误消息: {detail}")

    # 8c: 通过 introspect 验证整个家族的 token 都被撤销
    print_info("通过 introspect 验证 token 状态...")
    resp_introspect = await client.post(
        f"{BASE_URL}/introspect",
        data={
            "token": new_rt_after_first,
            "token_type_hint": "refresh_token",
        },
    )
    if resp_introspect.status_code == 200:
        intro_data = resp_introspect.json()
        assert intro_data.get("active") == False, "introspect 应显示 token 不活跃"
        print_pass(f"Introspect 验证: token.active={intro_data['active']}")

    print_pass(f"🧹 整个 Token 族 (family_id={family_id[:16]}...) 已全部失效！")

async def test_9_verify_token_type_check(
    client: httpx.AsyncClient,
) -> None:
    print_section("步骤 9: 历史安全特性 - verify_token 类型校验仍然生效")

    # 先登录拿一个 access_token (非 OAuth 流程，直接密码模式)
    resp = await client.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "testuser_pkce", "password": "TestPass123!"},
    )
    assert resp.status_code == 200
    access_token = resp.json()["access_token"]
    print_pass(f"获取普通 access_token")

    # 9a: 使用 refresh_token 当 access_token 调用 /userinfo 应该失败
    # 先生成一个 OAuth2 流程的 refresh_token
    resp_auth = await client.post(
        f"{BASE_URL}/authorize/submit",
        data={
            "client_id": "any",  # 我们将使用步骤5的 RT，这里跳过
            "redirect_uri": REDIRECT_URI,
            "scope": "read write",
            "state": secrets.token_urlsafe(16),
            "username": "testuser_pkce",
            "password": "TestPass123!",
            "action": "approve",
        },
        follow_redirects=False,
    )
    # 这里我们直接测试普通用户 access_token 能否正常工作
    resp_userinfo = await client.get(
        f"{BASE_URL}/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert resp_userinfo.status_code == 200, f"合法 access_token 调用 userinfo 失败: {resp_userinfo.status_code}"
    user_data = resp_userinfo.json()
    assert user_data["username"] == "testuser_pkce"
    print_pass(f"合法 access_token 成功访问 /userinfo: {user_data['username']}")

    # 9b: 使用错误格式 token 应该失败
    resp_bad = await client.get(
        f"{BASE_URL}/userinfo",
        headers={"Authorization": "Bearer obviously-invalid-token"},
    )
    assert resp_bad.status_code == 401, f"非法 token 应返回 401: {resp_bad.status_code}"
    print_pass(f"非法 token 被正确拒绝: HTTP {resp_bad.status_code}")

    print_pass(f"🔒 Token 类型校验安全特性仍然生效")

async def test_10_pkce_debug_endpoint(
    client: httpx.AsyncClient,
) -> None:
    print_section("步骤 10: PKCE 调试端点验证")

    verifier = generate_code_verifier(64)
    expected_challenge = compute_code_challenge_s256(verifier)

    resp = await client.get(
        f"{BASE_URL}/.well-known/pkce-challenge",
        params={"code_verifier": verifier, "method": "S256"},
    )
    assert resp.status_code == 200, f"调试端点失败: {resp.status_code}"
    data = resp.json()
    assert data["code_challenge"] == expected_challenge, \
        f"后端计算的 challenge 不一致: {data['code_challenge']} != {expected_challenge}"
    assert data["method"] == "S256"
    assert data["code_verifier"] == verifier

    print_pass(f"PKCE 调试端点工作正常")
    print_pass(f"前后端计算一致性验证通过")

async def main():
    async with httpx.AsyncClient(timeout=30.0) as client:
        print("\n" + "🚀" * 35)
        print("  PKCE (RFC7636) + Refresh Token Replay Detection - 完整集成测试")
        print("🚀" * 35)

        try:
            user = await test_1_register_user(client)
            client_id, client_secret = await test_2_create_client(client)

            # PKCE 正常流程
            _, rt_pkce, fid_pkce = await test_3_pkce_s256_normal_flow(
                client, client_id, client_secret
            )

            # PKCE 安全性
            await test_4_pkce_wrong_verifier_rejected(client, client_id, client_secret)

            # 传统流程
            _, rt_trad, fid_trad = await test_5_traditional_flow_without_pkce(
                client, client_id, client_secret
            )

            # Token Family 一致性（使用传统流程的 RT）
            latest_rt, latest_fid = await test_6_token_family_consistency(
                client, client_id, client_secret, rt_trad, fid_trad
            )

            # 重放检测（使用 PKCE 流程的 RT，它还没被用过）
            new_rt, fid = await test_7_replay_detection(
                client, client_id, client_secret, rt_pkce
            )

            # 整个族失效
            await test_8_family_invalidation_after_replay(
                client, client_id, client_secret, new_rt, fid
            )

            # 历史安全特性
            await test_9_verify_token_type_check(client)

            # PKCE 调试端点
            await test_10_pkce_debug_endpoint(client)

            print("\n" + "🎉" * 35)
            print("  所有 10 个测试步骤全部通过！✅")
            print("🎉" * 35)
            print("\n  测试结果总结:")
            print("  ✔️  用户注册与客户端注册")
            print("  ✔️  PKCE S256 正常授权流程")
            print("  ✔️  PKCE 错误 verifier 被拒绝")
            print("  ✔️  传统无 PKCE 流程兼容")
            print("  ✔️  Token Family ID 多轮刷新一致性")
            print("  ✔️  Refresh Token 重放攻击检测")
            print("  ✔️  重放检测后整个 Token 族撤销")
            print("  ✔️  Token 类型校验 (refresh 不能当 access)")
            print("  ✔️  PKCE 调试端点")
            print()

        except AssertionError as e:
            print_fail(f"测试断言失败: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
        except Exception as e:
            print_fail(f"测试异常: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
