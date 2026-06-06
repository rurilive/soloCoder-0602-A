import pandas as pd
from io import BytesIO
from typing import List, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.employee import Employee
from app.models.department import Department
from app.schemas.employee import EmployeeCreate
from sqlalchemy.future import select


async def export_employees_to_excel(db: AsyncSession) -> bytes:
    result = await db.execute(
        select(Employee, Department.name.label("dept_name"))
        .outerjoin(Department, Employee.department_id == Department.id)
    )
    rows = result.all()
    
    data = []
    for emp, dept_name in rows:
        data.append({
            "员工ID": emp.id,
            "姓名": emp.name,
            "邮箱": emp.email or "",
            "电话": emp.phone or "",
            "职位": emp.position or "",
            "部门": dept_name or "",
            "入职日期": emp.hire_date.strftime("%Y-%m-%d") if emp.hire_date else ""
        })
    
    df = pd.DataFrame(data)
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="员工通讯录")
    output.seek(0)
    return output.getvalue()


async def import_employees_from_excel(db: AsyncSession, file_content: bytes) -> Dict[str, Any]:
    try:
        df = pd.read_excel(BytesIO(file_content), engine="openpyxl")
    except Exception as e:
        return {"success": False, "message": f"Excel文件读取失败: {str(e)}", "imported": 0, "failed": 0}
    
    column_mapping = {
        "姓名": "name",
        "邮箱": "email",
        "电话": "phone",
        "职位": "position",
        "部门": "department",
        "入职日期": "hire_date"
    }
    
    df.columns = [str(col).strip() for col in df.columns]
    mapped_cols = {}
    for col in df.columns:
        if col in column_mapping:
            mapped_cols[col] = column_mapping[col]
    
    if "name" not in mapped_cols.values():
        return {"success": False, "message": "Excel中必须包含'姓名'列", "imported": 0, "failed": 0}
    
    dept_map = {}
    result = await db.execute(select(Department))
    for dept in result.scalars().all():
        dept_map[dept.name] = dept.id
    
    imported = 0
    failed = 0
    errors = []
    
    for idx, row in df.iterrows():
        try:
            emp_data = {}
            for excel_col, field in mapped_cols.items():
                value = row.get(excel_col)
                if pd.isna(value):
                    value = None
                
                if field == "department" and value:
                    dept_name = str(value).strip()
                    if dept_name in dept_map:
                        emp_data["department_id"] = dept_map[dept_name]
                    else:
                        new_dept = Department(name=dept_name)
                        db.add(new_dept)
                        await db.flush()
                        dept_map[dept_name] = new_dept.id
                        emp_data["department_id"] = new_dept.id
                elif field == "hire_date" and value:
                    if isinstance(value, datetime):
                        emp_data["hire_date"] = value.date()
                    elif isinstance(value, str):
                        try:
                            emp_data["hire_date"] = datetime.strptime(value, "%Y-%m-%d").date()
                        except:
                            pass
                elif field == "name" and value:
                    emp_data["name"] = str(value).strip()
                elif value:
                    emp_data[field] = str(value).strip()
            
            if "name" not in emp_data or not emp_data["name"]:
                failed += 1
                errors.append(f"第{idx + 2}行：缺少姓名")
                continue
            
            emp_in = EmployeeCreate(**emp_data)
            emp = Employee(**emp_in.model_dump())
            db.add(emp)
            imported += 1
        except Exception as e:
            failed += 1
            errors.append(f"第{idx + 2}行：{str(e)}")
    
    await db.commit()
    return {
        "success": True,
        "imported": imported,
        "failed": failed,
        "errors": errors[:20],
        "message": f"成功导入{imported}条记录"
    }
