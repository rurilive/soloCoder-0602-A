from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from app.models.department import Department
from app.models.employee import Employee
from app.schemas.department import DepartmentCreate, DepartmentUpdate


async def build_dept_tree(depts: List[Department], parent_id: Optional[int] = None) -> List[dict]:
    tree = []
    for dept in depts:
        if dept.parent_id == parent_id:
            children = await build_dept_tree(depts, dept.id)
            tree.append({
                "id": dept.id,
                "name": dept.name,
                "parent_id": dept.parent_id,
                "description": dept.description,
                "children": children,
                "employee_count": len(dept.employees)
            })
    return tree


async def get_all_departments(db: AsyncSession) -> List[dict]:
    result = await db.execute(
        select(Department).options(selectinload(Department.employees), selectinload(Department.children))
    )
    depts = result.scalars().all()
    return await build_dept_tree(list(depts))


async def get_department(db: AsyncSession, dept_id: int) -> Optional[Department]:
    result = await db.execute(
        select(Department).options(selectinload(Department.employees), selectinload(Department.children))
        .where(Department.id == dept_id)
    )
    return result.scalar_one_or_none()


async def create_department(db: AsyncSession, dept_in: DepartmentCreate) -> Department:
    dept = Department(**dept_in.model_dump())
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return dept


async def update_department(db: AsyncSession, dept_id: int, dept_in: DepartmentUpdate) -> Optional[Department]:
    dept = await get_department(db, dept_id)
    if not dept:
        return None
    update_data = dept_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(dept, key, value)
    await db.commit()
    await db.refresh(dept)
    return dept


async def delete_department(db: AsyncSession, dept_id: int) -> bool:
    dept = await get_department(db, dept_id)
    if not dept:
        return False
    await db.delete(dept)
    await db.commit()
    return True


async def get_all_department_ids(db: AsyncSession) -> List[int]:
    result = await db.execute(select(Department.id))
    return list(result.scalars().all())
