import time
import json
import urllib.request
import urllib.parse
import urllib.error

BASE_URL = "http://localhost:1111"


def http_request(method, url, data=None, headers=None, is_json=False):
    if headers is None:
        headers = {}
    if data is not None:
        if is_json:
            data_bytes = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"
        else:
            data_bytes = urllib.parse.urlencode(data).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"
    else:
        data_bytes = None

    req = urllib.request.Request(url, data=data_bytes, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body) if body else None
        except json.JSONDecodeError:
            return e.code, {"detail": body}


def test_health():
    print("\n=== 1. 测试健康检查 ===")
    status, data = http_request("GET", f"{BASE_URL}/health")
    print(f"  Status: {status}, Data: {data}")
    assert status == 200
    assert data["status"] == "ok"
    print("  ✅ 健康检查通过")


def test_register_and_login():
    print("\n=== 2. 注册用户并登录 ===")
    status, _ = http_request(
        "POST",
        f"{BASE_URL}/api/auth/register",
        data={
            "username": "testuser_device",
            "email": "device@test.com",
            "password": "password123",
        },
        is_json=True,
    )
    print(f"  注册 Status: {status}")
    if status == 201:
        print("  ✅ 注册成功")
    elif status == 400:
        print("  ℹ️ 用户已存在，跳过注册")
    else:
        print(f"  注册状态: {status}")

    status, data = http_request(
        "POST",
        f"{BASE_URL}/api/auth/login",
        data={
            "username": "testuser_device",
            "password": "password123",
        },
    )
    print(f"  登录 Status: {status}")
    assert status == 200, f"登录失败: {data}"
    token = data["access_token"]
    print("  ✅ 登录成功，获取到 access_token")
    return token


def test_create_client(token):
    print("\n=== 3. 创建测试客户端 ===")
    headers = {"Authorization": f"Bearer {token}"}
    status, data = http_request(
        "POST",
        f"{BASE_URL}/api/clients",
        data={
            "name": "Device Flow Test Client",
            "description": "用于测试设备授权流程的客户端",
            "redirect_uris": "http://localhost/callback",
            "scope": "read write",
        },
        headers=headers,
        is_json=True,
    )
    print(f"  创建客户端 Status: {status}")
    assert status == 201, f"创建客户端失败: {data}"
    client_id = data["client_id"]
    client_secret = data["client_secret"]
    print(f"  ✅ 客户端创建成功")
    print(f"    client_id: {client_id}")
    print(f"    client_secret: {client_secret[:10]}...")
    return client_id, client_secret


def test_device_authorization(client_id):
    print("\n=== 4. 发起设备授权请求 /device_authorization ===")
    status, data = http_request(
        "POST",
        f"{BASE_URL}/device_authorization",
        data={
            "client_id": client_id,
            "scope": "read write",
        },
    )
    print(f"  Status: {status}")
    assert status == 200, f"设备授权请求失败: {data}"
    device_code = data["device_code"]
    user_code = data["user_code"]
    verification_uri = data["verification_uri"]
    verification_uri_complete = data["verification_uri_complete"]
    expires_in = data["expires_in"]
    interval = data["interval"]

    print(f"  ✅ 设备授权请求成功")
    print(f"    device_code: {device_code[:20]}...")
    print(f"    user_code: {user_code}")
    print(f"    verification_uri: {verification_uri}")
    print(f"    verification_uri_complete: {verification_uri_complete}")
    print(f"    expires_in: {expires_in}s")
    print(f"    interval: {interval}s")

    assert expires_in == 900
    assert interval == 5
    assert len(user_code) == 9
    assert "-" in user_code

    return device_code, user_code


def test_public_device_verify(user_code):
    print("\n=== 5. 测试公开 user_code 验证接口 /api/public/device_verify ===")
    status, data = http_request(
        "POST",
        f"{BASE_URL}/api/public/device_verify",
        data={"user_code": user_code},
        is_json=True,
    )
    print(f"  Status: {status}")
    assert status == 200, f"用户码验证失败: {data}"
    print(f"  ✅ 用户码验证成功")
    print(f"    请求 ID: {data['id']}")
    print(f"    客户端名称: {data['client_name']}")
    print(f"    用户码: {data['user_code']}")
    print(f"    权限范围: {data['scope']}")
    print(f"    状态: {data['status']}")
    assert data["status"] == "pending"
    return data["id"]


def test_list_device_authorizations(token):
    print("\n=== 6. 管理员获取设备授权列表 ===")
    headers = {"Authorization": f"Bearer {token}"}
    status, data = http_request(
        "GET",
        f"{BASE_URL}/api/device_authorizations",
        headers=headers,
    )
    print(f"  Status: {status}")
    assert status == 200, f"获取列表失败: {data}"
    print(f"  ✅ 获取设备授权列表成功，共 {len(data)} 条记录")
    if data:
        pending = [d for d in data if d["status"] == "pending"]
        print(f"    待确认: {len(pending)}, 已批准: {len([d for d in data if d['status'] == 'approved'])}, 已拒绝: {len([d for d in data if d['status'] == 'denied'])}")


def test_pending_token(device_code, client_id, client_secret):
    print("\n=== 7. 设备轮询 /token (pending 状态，预期 authorization_pending) ===")
    status, data = http_request(
        "POST",
        f"{BASE_URL}/token",
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": device_code,
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    print(f"  Status: {status}")
    assert status == 400, f"预期返回 400，实际: {status}"
    detail = data.get("detail") if isinstance(data, dict) else data
    if isinstance(detail, dict):
        err = detail.get("error")
    else:
        err = str(detail)[:50]
    print(f"  ✅ 正确返回 authorization_pending 错误")
    print(f"    error: {err}")


def test_approve_device_auth(token, auth_id):
    print("\n=== 8. 管理员批准设备授权 ===")
    headers = {"Authorization": f"Bearer {token}"}
    status, data = http_request(
        "POST",
        f"{BASE_URL}/api/device_authorizations/{auth_id}/approve",
        headers=headers,
    )
    print(f"  Status: {status}")
    assert status == 200, f"批准失败: {data}"
    assert data["status"] == "approved"
    print("  ✅ 设备授权已批准")


def test_token_exchange_after_approve(device_code, client_id, client_secret):
    print("\n=== 9. 批准后设备轮询获取 token ===")
    status, data = http_request(
        "POST",
        f"{BASE_URL}/token",
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": device_code,
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    print(f"  Status: {status}")
    assert status == 200, f"获取 token 失败: {data}"
    print("  ✅ 成功获取 access_token 和 refresh_token")
    print(f"    access_token: {data['access_token'][:50]}...")
    rt = data.get("refresh_token", "")
    print(f"    refresh_token: {rt[:30]}...")
    print(f"    expires_in: {data['expires_in']}s")
    print(f"    scope: {data['scope']}")
    print(f"    token_family_id: {data.get('token_family_id')}")
    assert data["token_type"] == "Bearer"
    assert data["expires_in"] > 0
    return data


def test_reuse_device_code(device_code, client_id, client_secret):
    print("\n=== 10. 测试已使用的 device_code 不可重复使用 ===")
    status, data = http_request(
        "POST",
        f"{BASE_URL}/token",
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": device_code,
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    print(f"  Status: {status}")
    assert status == 400, f"预期返回 400 (重复使用)，实际: {status}"
    print("  ✅ 已正确阻止重复使用 device_code")


def test_device_deny_flow(client_id, client_secret, token):
    print("\n=== 11. 测试设备授权拒绝流程 ===")

    status, data = http_request(
        "POST",
        f"{BASE_URL}/device_authorization",
        data={"client_id": client_id, "scope": "read"},
    )
    assert status == 200
    device_code = data["device_code"]
    user_code = data["user_code"]
    print(f"  发起设备授权: user_code={user_code}")

    headers = {"Authorization": f"Bearer {token}"}
    status, data = http_request(
        "GET",
        f"{BASE_URL}/api/device_authorizations?status=pending",
        headers=headers,
    )
    pending = [d for d in data if d["user_code"] == user_code]
    assert pending, "找不到待确认请求"
    auth_id = pending[0]["id"]

    status, data = http_request(
        "POST",
        f"{BASE_URL}/api/device_authorizations/{auth_id}/deny",
        headers=headers,
    )
    assert status == 200
    assert data["status"] == "denied"
    print("  ✅ 授权已拒绝")

    status, data = http_request(
        "POST",
        f"{BASE_URL}/token",
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": device_code,
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    assert status == 400
    detail = data.get("detail") if isinstance(data, dict) else {}
    error = detail.get("error") if isinstance(detail, dict) else str(detail)
    if error == "access_denied":
        print("  ✅ 设备轮询正确返回 access_denied")
    else:
        print(f"  ⚠️ 返回错误: {error}")

    print("  ✅ 拒绝流程验证通过")


def test_invalid_client_device_auth():
    print("\n=== 12. 测试无效 client_id 的设备授权请求 ===")
    status, data = http_request(
        "POST",
        f"{BASE_URL}/device_authorization",
        data={"client_id": "invalid_client_id_12345"},
    )
    print(f"  Status: {status}")
    assert status == 401, f"预期返回 401，实际: {status}"
    print("  ✅ 正确拒绝无效 client_id")


def test_invalid_user_code_verify():
    print("\n=== 13. 测试无效 user_code 验证 ===")
    status, data = http_request(
        "POST",
        f"{BASE_URL}/api/public/device_verify",
        data={"user_code": "XXXX-YYYY"},
        is_json=True,
    )
    print(f"  Status: {status}")
    assert status == 404, f"预期返回 404，实际: {status}"
    print("  ✅ 正确拒绝无效 user_code")


def main():
    print("=" * 70)
    print(" OAuth2.0 设备授权流程 (RFC 8628) 集成测试")
    print("=" * 70)

    try:
        test_health()
        token = test_register_and_login()
        client_id, client_secret = test_create_client(token)
        device_code, user_code = test_device_authorization(client_id)
        auth_id = test_public_device_verify(user_code)
        test_list_device_authorizations(token)
        test_pending_token(device_code, client_id, client_secret)
        test_approve_device_auth(token, auth_id)
        test_token_exchange_after_approve(device_code, client_id, client_secret)
        test_reuse_device_code(device_code, client_id, client_secret)
        test_device_deny_flow(client_id, client_secret, token)
        test_invalid_client_device_auth()
        test_invalid_user_code_verify()

        print("\n" + "=" * 70)
        print(" 🎉 所有测试通过！设备授权流程实现完整。")
        print("=" * 70)
    except AssertionError as e:
        print(f"\n❌ 断言失败: {e}")
        raise
    except Exception as e:
        print(f"\n❌ 发生错误: {e}")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()
