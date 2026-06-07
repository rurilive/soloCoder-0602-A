import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.database import Base
from app.models.employee import Employee
from app.models.department import Department

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
async def sample_employees(db_session):
    dept = Department(name="技术部")
    db_session.add(dept)
    await db_session.flush()
    
    employees = [
        Employee(name="张三", email="zhangsan@example.com", phone="13800138001", position="工程师", department_id=dept.id),
        Employee(name="李四", email="lisi@example.com", phone="13800138002", position="经理", department_id=dept.id),
        Employee(name="王五", email="wangwu@example.com", phone="13800138003", position="设计师", department_id=dept.id),
        Employee(name="赵六%", email="zhaoliu@example.com", phone="13800138004", position="测试", department_id=dept.id),
        Employee(name="钱七_", email="qianqi@example.com", phone="13800138005", position="运维", department_id=dept.id),
    ]
    for emp in employees:
        db_session.add(emp)
    await db_session.commit()
    return employees
