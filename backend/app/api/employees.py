from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from io import BytesIO
from app.database import get_db
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse, EmployeeSearchResult
from app.services import employee_service
from app.utils.excel_handler import export_employees_to_excel, import_employees_from_excel

router = APIRouter(prefix="/api/employees", tags=["员工管理"])


@router.get("", response_model=dict)
async def list_employees(
    skip: int = 0,
    limit: int = 100,
    department_id: Optional[int] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    employees, total = await employee_service.get_employees(db, skip, limit, department_id, search)
    return {
        "total": total,
        "items": [
            {
                "id": emp.id,
                "name": emp.name,
                "email": emp.email,
                "phone": emp.phone,
                "position": emp.position,
                "department_id": emp.department_id,
                "department_name": emp.department.name if emp.department else None,
                "hire_date": emp.hire_date.isoformat() if emp.hire_date else None,
                "avatar": emp.avatar
            }
            for emp in employees
        ]
    }


@router.get("/search", response_model=List[EmployeeSearchResult])
async def search_employees(keyword: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    return await employee_service.search_employees(db, keyword)


@router.post("", response_model=dict)
async def create_employee(emp_in: EmployeeCreate, db: AsyncSession = Depends(get_db)):
    emp = await employee_service.create_employee(db, emp_in)
    return {
        "id": emp.id,
        "name": emp.name,
        "email": emp.email,
        "phone": emp.phone,
        "position": emp.position,
        "department_id": emp.department_id,
        "hire_date": emp.hire_date.isoformat() if emp.hire_date else None
    }


@router.get("/{emp_id}", response_model=dict)
async def get_employee(emp_id: int, db: AsyncSession = Depends(get_db)):
    emp = await employee_service.get_employee(db, emp_id)
    if not emp:
        raise HTTPException(status_code=404, detail="员工不存在")
    return {
        "id": emp.id,
        "name": emp.name,
        "email": emp.email,
        "phone": emp.phone,
        "position": emp.position,
        "department_id": emp.department_id,
        "department_name": emp.department.name if emp.department else None,
        "hire_date": emp.hire_date.isoformat() if emp.hire_date else None,
        "avatar": emp.avatar
    }


@router.put("/{emp_id}", response_model=dict)
async def update_employee(emp_id: int, emp_in: EmployeeUpdate, db: AsyncSession = Depends(get_db)):
    emp = await employee_service.update_employee(db, emp_id, emp_in)
    if not emp:
        raise HTTPException(status_code=404, detail="员工不存在")
    return {
        "id": emp.id,
        "name": emp.name,
        "email": emp.email,
        "phone": emp.phone,
        "position": emp.position,
        "department_id": emp.department_id,
        "hire_date": emp.hire_date.isoformat() if emp.hire_date else None
    }


@router.delete("/{emp_id}")
async def delete_employee(emp_id: int, db: AsyncSession = Depends(get_db)):
    success = await employee_service.delete_employee(db, emp_id)
    if not success:
        raise HTTPException(status_code=404, detail="员工不存在")
    return {"message": "删除成功"}


@router.get("/export/excel")
async def export_excel(db: AsyncSession = Depends(get_db)):
    content = await export_employees_to_excel(db)
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=employees.xlsx"}
    )


@router.post("/import/excel")
async def import_excel(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename or not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="请上传Excel文件(.xlsx或.xls)")
    content = await file.read()
    result = await import_employees_from_excel(db, content)
    return result
