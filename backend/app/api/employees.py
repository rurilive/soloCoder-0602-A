from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from io import BytesIO
from app.database import get_db
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse, EmployeeSearchResult
from app.services import employee_service
from app.utils.excel_handler import export_employees_to_excel, import_employees_from_excel
from app.permissions import permission_middleware, check_employee_permission, check_department_permission
from app.models.employee import Employee
from app.models import UserRole
from app.services import department_service

router = APIRouter(prefix="/api/employees", tags=["员工管理"])


@router.get("", response_model=dict)
async def list_employees(
    skip: int = 0,
    limit: int = 100,
    department_id: Optional[int] = None,
    search: Optional[str] = None,
    auth_data: tuple = Depends(permission_middleware)
):
    current_user, db = auth_data
    
    filtered_dept_id = department_id
    if current_user.role not in (UserRole.ADMIN, UserRole.HR):
        accessible_dept_ids = await department_service.get_all_child_department_ids(
            db, current_user.department_id
        )
        if department_id is not None:
            if department_id not in accessible_dept_ids:
                return {"total": 0, "items": []}
        else:
            if not accessible_dept_ids:
                return {"total": 0, "items": []}
            filtered_dept_id = None
            employees, total = await employee_service.get_employees_by_dept_ids(
                db, skip, limit, accessible_dept_ids, search
            )
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
    
    employees, total = await employee_service.get_employees(db, skip, limit, filtered_dept_id, search)
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
async def search_employees(
    keyword: str = Query(..., min_length=1),
    auth_data: tuple = Depends(permission_middleware)
):
    current_user, db = auth_data
    
    if current_user.role in (UserRole.ADMIN, UserRole.HR):
        return await employee_service.search_employees(db, keyword)
    
    accessible_dept_ids = await department_service.get_all_child_department_ids(
        db, current_user.department_id
    )
    return await employee_service.search_employees_by_dept_ids(
        db, keyword, accessible_dept_ids
    )


@router.post("", response_model=dict)
async def create_employee(
    emp_in: EmployeeCreate,
    auth_data: tuple = Depends(permission_middleware)
):
    current_user, db = auth_data
    
    if current_user.role not in (UserRole.ADMIN, UserRole.HR):
        if not await check_department_permission(db, current_user, emp_in.department_id):
            raise HTTPException(
                status_code=403,
                detail="无权限在该部门创建员工"
            )
    
    emp = await employee_service.create_employee(db, emp_in)
    return {
        "id": emp.id,
        "name": emp.name,
        "email": emp.email,
        "phone": emp.phone,
        "position": emp.position,
        "department_id": emp.department_id,
        "hire_date": emp.hire_date.isoformat() if emp.hire_date else None,
        "role": emp.role
    }


@router.get("/{emp_id}", response_model=dict)
async def get_employee(
    emp_id: int,
    auth_data: tuple = Depends(permission_middleware)
):
    current_user, db = auth_data
    emp = await employee_service.get_employee(db, emp_id)
    if not emp:
        raise HTTPException(status_code=404, detail="员工不存在")
    
    if not await check_employee_permission(db, current_user, emp):
        raise HTTPException(
            status_code=403,
            detail="无权限查看该员工信息"
        )
    
    return {
        "id": emp.id,
        "name": emp.name,
        "email": emp.email,
        "phone": emp.phone,
        "position": emp.position,
        "department_id": emp.department_id,
        "department_name": emp.department.name if emp.department else None,
        "hire_date": emp.hire_date.isoformat() if emp.hire_date else None,
        "avatar": emp.avatar,
        "role": emp.role
    }


@router.put("/{emp_id}", response_model=dict)
async def update_employee(
    emp_id: int,
    emp_in: EmployeeUpdate,
    auth_data: tuple = Depends(permission_middleware)
):
    current_user, db = auth_data
    emp = await employee_service.get_employee(db, emp_id)
    if not emp:
        raise HTTPException(status_code=404, detail="员工不存在")
    
    if not await check_employee_permission(db, current_user, emp):
        raise HTTPException(
            status_code=403,
            detail="无权限编辑该员工信息"
        )
    
    if emp_in.department_id is not None and emp_in.department_id != emp.department_id:
        if current_user.role not in (UserRole.ADMIN, UserRole.HR):
            if not await check_department_permission(db, current_user, emp_in.department_id):
                raise HTTPException(
                    status_code=403,
                    detail="无权限将员工移动到该部门"
                )
    
    emp = await employee_service.update_employee(db, emp_id, emp_in)
    return {
        "id": emp.id,
        "name": emp.name,
        "email": emp.email,
        "phone": emp.phone,
        "position": emp.position,
        "department_id": emp.department_id,
        "hire_date": emp.hire_date.isoformat() if emp.hire_date else None,
        "role": emp.role
    }


@router.delete("/{emp_id}")
async def delete_employee(
    emp_id: int,
    auth_data: tuple = Depends(permission_middleware)
):
    current_user, db = auth_data
    emp = await employee_service.get_employee(db, emp_id)
    if not emp:
        raise HTTPException(status_code=404, detail="员工不存在")
    
    if not await check_employee_permission(db, current_user, emp):
        raise HTTPException(
            status_code=403,
            detail="无权限删除该员工"
        )
    
    success = await employee_service.delete_employee(db, emp_id)
    if not success:
        raise HTTPException(status_code=404, detail="员工不存在")
    return {"message": "删除成功"}


@router.get("/export/excel")
async def export_excel(
    auth_data: tuple = Depends(permission_middleware)
):
    _, db = auth_data
    content = await export_employees_to_excel(db)
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=employees.xlsx"}
    )


@router.post("/import/excel")
async def import_excel(
    file: UploadFile = File(...),
    auth_data: tuple = Depends(permission_middleware)
):
    _, db = auth_data
    if not file.filename or not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="请上传Excel文件(.xlsx或.xls)")
    content = await file.read()
    result = await import_employees_from_excel(db, content)
    return result
