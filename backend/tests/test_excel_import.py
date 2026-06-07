import pytest
import pandas as pd
from io import BytesIO
from app.utils.excel_handler import import_employees_from_excel
from app.models.employee import Employee
from sqlalchemy.future import select


pytestmark = pytest.mark.asyncio


def create_test_excel(data):
    df = pd.DataFrame(data)
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Sheet1")
    output.seek(0)
    return output.getvalue()


async def test_import_new_employees(db_session):
    excel_data = [
        {"姓名": "测试1", "邮箱": "test1@example.com", "电话": "13900139001", "职位": "测试工程师"},
        {"姓名": "测试2", "邮箱": "test2@example.com", "电话": "13900139002", "职位": "开发工程师"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert result["success"] is True
    assert result["imported"] == 2
    assert result["skipped"] == 0
    assert result["failed"] == 0
    
    db_result = await db_session.execute(select(Employee).where(Employee.name.in_(["测试1", "测试2"])))
    employees = db_result.scalars().all()
    assert len(employees) == 2


async def test_import_skip_duplicates(db_session, sample_employees):
    excel_data = [
        {"姓名": "张三", "邮箱": "zhangsan@example.com", "电话": "13800138001", "职位": "工程师"},
        {"姓名": "新员工", "邮箱": "new@example.com", "电话": "13900139999", "职位": "新职位"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert result["success"] is True
    assert result["imported"] == 1
    assert result["skipped"] == 1
    assert result["failed"] == 0
    assert len(result["skipped_details"]) == 1
    assert "张三" in result["skipped_details"][0]
    
    db_result = await db_session.execute(select(Employee).where(Employee.name == "新员工"))
    new_emp = db_result.scalar_one_or_none()
    assert new_emp is not None


async def test_import_same_name_different_email(db_session, sample_employees):
    excel_data = [
        {"姓名": "张三", "邮箱": "different@example.com", "电话": "13900139003", "职位": "另一个职位"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert result["success"] is True
    assert result["imported"] == 1
    assert result["skipped"] == 0


async def test_import_same_email_different_name(db_session, sample_employees):
    excel_data = [
        {"姓名": "另一个张三", "邮箱": "zhangsan@example.com", "电话": "13900139004", "职位": "职位"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert result["success"] is True
    assert result["imported"] == 1
    assert result["skipped"] == 0


async def test_import_within_same_excel_duplicates(db_session):
    excel_data = [
        {"姓名": "同文件重复", "邮箱": "dup@example.com", "电话": "13900139100", "职位": "重复测试"},
        {"姓名": "同文件重复", "邮箱": "dup@example.com", "电话": "13900139101", "职位": "重复测试2"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert result["success"] is True
    assert result["imported"] == 1
    assert result["skipped"] == 1


async def test_import_empty_email_duplicate(db_session):
    await db_session.execute(
        Employee.__table__.insert(),
        [{"name": "无邮箱员工", "email": None, "phone": "13900139200", "position": "测试"}]
    )
    await db_session.commit()
    
    excel_data = [
        {"姓名": "无邮箱员工", "邮箱": "", "电话": "13900139201", "职位": "重复"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert result["success"] is True
    assert result["imported"] == 0
    assert result["skipped"] == 1


async def test_import_message_contains_skipped(db_session, sample_employees):
    excel_data = [
        {"姓名": "张三", "邮箱": "zhangsan@example.com", "电话": "13800138001", "职位": "工程师"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert "跳过" in result["message"]
    assert "重复" in result["message"]


async def test_import_db_null_vs_excel_nan_email(db_session):
    await db_session.execute(
        Employee.__table__.insert(),
        [{"name": "NaN邮箱测试", "email": None, "phone": "13900139300", "position": "测试"}]
    )
    await db_session.commit()
    
    excel_data = [
        {"姓名": "NaN邮箱测试", "邮箱": float('nan'), "电话": "13900139301", "职位": "重复"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert result["success"] is True
    assert result["imported"] == 0
    assert result["skipped"] == 1


async def test_import_db_null_vs_excel_missing_email_column(db_session):
    await db_session.execute(
        Employee.__table__.insert(),
        [{"name": "缺列测试", "email": None, "phone": "13900139400", "position": "测试"}]
    )
    await db_session.commit()
    
    excel_data = [
        {"姓名": "缺列测试", "电话": "13900139401", "职位": "重复"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert result["success"] is True
    assert result["imported"] == 0
    assert result["skipped"] == 1


async def test_import_db_empty_string_vs_excel_empty_email(db_session):
    await db_session.execute(
        Employee.__table__.insert(),
        [{"name": "空串测试", "email": "", "phone": "13900139500", "position": "测试"}]
    )
    await db_session.commit()
    
    excel_data = [
        {"姓名": "空串测试", "邮箱": "", "电话": "13900139501", "职位": "重复"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert result["success"] is True
    assert result["imported"] == 0
    assert result["skipped"] == 1


async def test_import_within_same_excel_null_email_duplicates(db_session):
    excel_data = [
        {"姓名": "同文件无邮箱", "邮箱": "", "电话": "13900139600", "职位": "重复测试1"},
        {"姓名": "同文件无邮箱", "邮箱": float('nan'), "电话": "13900139601", "职位": "重复测试2"},
    ]
    file_content = create_test_excel(excel_data)
    
    result = await import_employees_from_excel(db_session, file_content)
    
    assert result["success"] is True
    assert result["imported"] == 1
    assert result["skipped"] == 1
