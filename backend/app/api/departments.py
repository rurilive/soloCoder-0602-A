from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.schemas.department import DepartmentCreate, DepartmentUpdate, DepartmentResponse
from app.services import department_service

router = APIRouter(prefix="/api/departments", tags=["部门管理"])


@router.get("", response_model=List[dict])
async def list_departments(db: AsyncSession = Depends(get_db)):
    return await department_service.get_all_departments(db)


@router.post("", response_model=dict)
async def create_department(dept_in: DepartmentCreate, db: AsyncSession = Depends(get_db)):
    dept = await department_service.create_department(db, dept_in)
    return {"id": dept.id, "name": dept.name, "parent_id": dept.parent_id, "description": dept.description}


@router.get("/{dept_id}", response_model=dict)
async def get_department(dept_id: int, db: AsyncSession = Depends(get_db)):
    dept = await department_service.get_department(db, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="部门不存在")
    return {
        "id": dept.id,
        "name": dept.name,
        "parent_id": dept.parent_id,
        "description": dept.description,
        "employee_count": len(dept.employees)
    }


@router.put("/{dept_id}", response_model=dict)
async def update_department(dept_id: int, dept_in: DepartmentUpdate, db: AsyncSession = Depends(get_db)):
    dept = await department_service.update_department(db, dept_id, dept_in)
    if not dept:
        raise HTTPException(status_code=404, detail="部门不存在")
    return {"id": dept.id, "name": dept.name, "parent_id": dept.parent_id, "description": dept.description}


@router.delete("/{dept_id}")
async def delete_department(dept_id: int, db: AsyncSession = Depends(get_db)):
    success = await department_service.delete_department(db, dept_id)
    if not success:
        raise HTTPException(status_code=404, detail="部门不存在")
    return {"message": "删除成功"}
