import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.database import Base, get_db
from app.models.department import Department
from app.models.employee import Employee
from app.models import UserRole
from app.auth import create_access_token, get_password_hash
from app.main import app
from datetime import date

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    AsyncSessionTest = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with AsyncSessionTest() as session:
        yield session
    
    await engine.dispose()


@pytest_asyncio.fixture
async def test_data(db_session: AsyncSession):
    root = Department(name="总公司")
    db_session.add(root)
    await db_session.flush()
    
    tech = Department(name="技术部", parent_id=root.id)
    sales = Department(name="销售部", parent_id=root.id)
    hr = Department(name="人力资源部", parent_id=root.id)
    finance = Department(name="财务部", parent_id=root.id)
    db_session.add_all([tech, sales, hr, finance])
    await db_session.flush()
    
    frontend = Department(name="前端组", parent_id=tech.id)
    backend = Department(name="后端组", parent_id=tech.id)
    db_session.add_all([frontend, backend])
    await db_session.flush()
    
    default_pwd_hash = get_password_hash("123456")
    
    admin_user = Employee(
        name="管理员",
        email="admin@example.com",
        position="系统管理员",
        department_id=finance.id,
        hire_date=date(2020, 1, 1),
        role=UserRole.ADMIN,
        password_hash=default_pwd_hash
    )
    hr_user = Employee(
        name="HR人员",
        email="hr@example.com",
        position="HR经理",
        department_id=hr.id,
        hire_date=date(2020, 1, 1),
        role=UserRole.HR,
        password_hash=default_pwd_hash
    )
    tech_manager = Employee(
        name="技术经理",
        email="techmgr@example.com",
        position="技术总监",
        department_id=tech.id,
        hire_date=date(2020, 1, 1),
        role=UserRole.MANAGER,
        password_hash=default_pwd_hash
    )
    frontend_emp = Employee(
        name="前端员工",
        email="frontend@example.com",
        position="前端工程师",
        department_id=frontend.id,
        hire_date=date(2021, 1, 1),
        role=UserRole.EMPLOYEE,
        password_hash=default_pwd_hash
    )
    backend_emp = Employee(
        name="后端员工",
        email="backend@example.com",
        position="后端工程师",
        department_id=backend.id,
        hire_date=date(2021, 1, 1),
        role=UserRole.EMPLOYEE,
        password_hash=default_pwd_hash
    )
    sales_emp = Employee(
        name="销售员工",
        email="sales@example.com",
        position="销售代表",
        department_id=sales.id,
        hire_date=date(2021, 1, 1),
        role=UserRole.EMPLOYEE,
        password_hash=default_pwd_hash
    )
    
    db_session.add_all([admin_user, hr_user, tech_manager, frontend_emp, backend_emp, sales_emp])
    await db_session.commit()
    await db_session.refresh(admin_user)
    await db_session.refresh(hr_user)
    await db_session.refresh(tech_manager)
    await db_session.refresh(frontend_emp)
    await db_session.refresh(backend_emp)
    await db_session.refresh(sales_emp)
    
    return {
        "admin": admin_user,
        "hr": hr_user,
        "manager": tech_manager,
        "frontend_emp": frontend_emp,
        "backend_emp": backend_emp,
        "sales_emp": sales_emp,
        "depts": {
            "root": root,
            "tech": tech,
            "sales": sales,
            "hr": hr,
            "finance": finance,
            "frontend": frontend,
            "backend": backend
        }
    }


def create_test_client(db_session: AsyncSession):
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def get_token(user: Employee):
    return create_access_token(data={
        "sub": user.id,
        "role": user.role,
        "department_id": user.department_id
    })


@pytest.mark.asyncio
async def test_health_check_no_auth(db_session: AsyncSession):
    async with create_test_client(db_session) as client:
        response = await client.get("/api/health")
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_unauthenticated_access_denied(db_session: AsyncSession, test_data):
    async with create_test_client(db_session) as client:
        response = await client.get("/api/employees")
        assert response.status_code in (401, 403)
        
        response = await client.get("/api/departments")
        assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_employee_role_can_view_own_dept_employees(db_session: AsyncSession, test_data):
    user = test_data["frontend_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.get("/api/employees", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        emp_names = [emp["name"] for emp in data["items"]]
        assert "前端员工" in emp_names


@pytest.mark.asyncio
async def test_employee_role_cannot_view_other_dept_employees(db_session: AsyncSession, test_data):
    user = test_data["frontend_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.get("/api/employees", headers=headers)
        assert response.status_code == 200
        data = response.json()
        emp_names = [emp["name"] for emp in data["items"]]
        assert "销售员工" not in emp_names


@pytest.mark.asyncio
async def test_employee_role_cannot_edit(db_session: AsyncSession, test_data):
    user = test_data["frontend_emp"]
    target = test_data["frontend_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.put(
            f"/api/employees/{target.id}",
            headers=headers,
            json={"name": "修改后名字"}
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_employee_role_cannot_create(db_session: AsyncSession, test_data):
    user = test_data["frontend_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.post(
            "/api/employees",
            headers=headers,
            json={"name": "新员工"}
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_manager_can_edit_own_dept_employees(db_session: AsyncSession, test_data):
    user = test_data["manager"]
    target = test_data["frontend_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.put(
            f"/api/employees/{target.id}",
            headers=headers,
            json={"phone": "13900139000"}
        )
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_manager_cannot_edit_other_dept_employees(db_session: AsyncSession, test_data):
    user = test_data["manager"]
    target = test_data["sales_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.put(
            f"/api/employees/{target.id}",
            headers=headers,
            json={"phone": "13900139000"}
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_manager_recursive_child_dept_access(db_session: AsyncSession, test_data):
    user = test_data["manager"]
    target = test_data["backend_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.get(
            f"/api/employees/{target.id}",
            headers=headers
        )
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_hr_can_view_all_employees(db_session: AsyncSession, test_data):
    user = test_data["hr"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.get("/api/employees", headers=headers)
        assert response.status_code == 200
        data = response.json()
        emp_names = [emp["name"] for emp in data["items"]]
        assert "前端员工" in emp_names
        assert "销售员工" in emp_names


@pytest.mark.asyncio
async def test_hr_can_edit_any_employee(db_session: AsyncSession, test_data):
    user = test_data["hr"]
    target = test_data["sales_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.put(
            f"/api/employees/{target.id}",
            headers=headers,
            json={"phone": "13800138999"}
        )
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_hr_can_export(db_session: AsyncSession, test_data):
    user = test_data["hr"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.get("/api/employees/export/excel", headers=headers)
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_employee_cannot_export(db_session: AsyncSession, test_data):
    user = test_data["frontend_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.get("/api/employees/export/excel", headers=headers)
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_manage_departments(db_session: AsyncSession, test_data):
    user = test_data["admin"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.post(
            "/api/departments",
            headers=headers,
            json={"name": "测试部门"}
        )
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_non_admin_cannot_manage_departments(db_session: AsyncSession, test_data):
    user = test_data["hr"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.post(
            "/api/departments",
            headers=headers,
            json={"name": "测试部门"}
        )
        assert response.status_code == 403
        
        user2 = test_data["manager"]
        token2 = get_token(user2)
        headers2 = {"Authorization": f"Bearer {token2}"}
        response = await client.post(
            "/api/departments",
            headers=headers2,
            json={"name": "测试部门"}
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_login_success(db_session: AsyncSession, test_data):
    async with create_test_client(db_session) as client:
        response = await client.post(
            "/api/auth/login",
            json={"name": "管理员", "password": "123456"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["employee"]["name"] == "管理员"
        assert data["employee"]["role"] == UserRole.ADMIN


@pytest.mark.asyncio
async def test_login_wrong_password(db_session: AsyncSession, test_data):
    async with create_test_client(db_session) as client:
        response = await client.post(
            "/api/auth/login",
            json={"name": "管理员", "password": "wrong"}
        )
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token(db_session: AsyncSession, test_data):
    async with create_test_client(db_session) as client:
        response = await client.get(
            "/api/employees",
            headers={"Authorization": "Bearer invalid_token"}
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_manager_cannot_set_admin_role_on_create(db_session: AsyncSession, test_data):
    user = test_data["manager"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.post(
            "/api/employees",
            headers=headers,
            json={
                "name": "新员工",
                "role": "admin",
                "department_id": test_data["depts"]["frontend"].id
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == UserRole.EMPLOYEE
        assert data["role"] != UserRole.ADMIN


@pytest.mark.asyncio
async def test_hr_cannot_set_admin_role_on_create(db_session: AsyncSession, test_data):
    user = test_data["hr"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.post(
            "/api/employees",
            headers=headers,
            json={
                "name": "新员工2",
                "role": "admin",
                "department_id": test_data["depts"]["hr"].id
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == UserRole.EMPLOYEE


@pytest.mark.asyncio
async def test_update_employee_cannot_change_role(db_session: AsyncSession, test_data):
    user = test_data["admin"]
    target = test_data["frontend_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.put(
            f"/api/employees/{target.id}",
            headers=headers,
            json={
                "name": "修改后名字",
                "role": "admin"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == UserRole.EMPLOYEE
        assert data["role"] != UserRole.ADMIN


@pytest.mark.asyncio
async def test_admin_can_change_role_via_role_api(db_session: AsyncSession, test_data):
    user = test_data["admin"]
    target = test_data["frontend_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.put(
            f"/api/employees/{target.id}/role",
            headers=headers,
            json={"role": "manager"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == UserRole.MANAGER


@pytest.mark.asyncio
async def test_non_admin_cannot_change_role_via_role_api(db_session: AsyncSession, test_data):
    user = test_data["manager"]
    target = test_data["frontend_emp"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.put(
            f"/api/employees/{target.id}/role",
            headers=headers,
            json={"role": "admin"}
        )
        assert response.status_code == 403
        
        user2 = test_data["hr"]
        token2 = get_token(user2)
        headers2 = {"Authorization": f"Bearer {token2}"}
        response = await client.put(
            f"/api/employees/{target.id}/role",
            headers=headers2,
            json={"role": "admin"}
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_new_employee_default_role_is_employee(db_session: AsyncSession, test_data):
    user = test_data["admin"]
    token = get_token(user)
    headers = {"Authorization": f"Bearer {token}"}
    
    async with create_test_client(db_session) as client:
        response = await client.post(
            "/api/employees",
            headers=headers,
            json={
                "name": "测试新员工",
                "department_id": test_data["depts"]["hr"].id
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == UserRole.EMPLOYEE
