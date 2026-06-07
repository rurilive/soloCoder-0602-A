import pytest
from app.services import employee_service


pytestmark = pytest.mark.asyncio


async def test_search_normal(db_session, sample_employees):
    results = await employee_service.search_employees(db_session, "张")
    assert len(results) == 1
    assert results[0].name == "张三"


async def test_search_percent_not_match_all(db_session, sample_employees):
    results = await employee_service.search_employees(db_session, "%")
    assert len(results) == 1
    assert results[0].name == "赵六%"


async def test_search_underscore_not_match_all(db_session, sample_employees):
    results = await employee_service.search_employees(db_session, "_")
    assert len(results) == 1
    assert results[0].name == "钱七_"


async def test_search_with_percent_in_name(db_session, sample_employees):
    results = await employee_service.search_employees(db_session, "赵六")
    assert len(results) == 1
    assert results[0].name == "赵六%"


async def test_search_with_underscore_in_name(db_session, sample_employees):
    results = await employee_service.search_employees(db_session, "钱七")
    assert len(results) == 1
    assert results[0].name == "钱七_"


async def test_get_employees_search_normal(db_session, sample_employees):
    employees, total = await employee_service.get_employees(db_session, search="李")
    assert total == 1
    assert employees[0].name == "李四"


async def test_get_employees_search_percent_not_match_all(db_session, sample_employees):
    employees, total = await employee_service.get_employees(db_session, search="%")
    assert total == 1
    assert employees[0].name == "赵六%"


async def test_get_employees_search_underscore_not_match_all(db_session, sample_employees):
    employees, total = await employee_service.get_employees(db_session, search="_")
    assert total == 1
    assert employees[0].name == "钱七_"


async def test_search_email(db_session, sample_employees):
    results = await employee_service.search_employees(db_session, "zhangsan")
    assert len(results) == 1
    assert results[0].email == "zhangsan@example.com"


async def test_search_position(db_session, sample_employees):
    results = await employee_service.search_employees(db_session, "工程师")
    assert len(results) == 1
    assert results[0].name == "张三"
