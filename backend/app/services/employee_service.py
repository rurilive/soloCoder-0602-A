from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional, Tuple
from app.models.employee import Employee
from app.models.department import Department
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeSearchResult


async def get_employees(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    department_id: Optional[int] = None,
    search: Optional[str] = None
) -> Tuple[List[Employee], int]:
    query = select(Employee).options(selectinload(Employee.department))
    count_query = select(Employee.id)
    
    if department_id is not None:
        query = query.where(Employee.department_id == department_id)
        count_query = count_query.where(Employee.department_id == department_id)
    
    if search:
        search_pattern = f"%{search}%"
        search_condition = (
            (Employee.name.like(search_pattern)) |
            (Employee.email.like(search_pattern)) |
            (Employee.phone.like(search_pattern)) |
            (Employee.position.like(search_pattern))
        )
        query = query.where(search_condition)
        count_query = count_query.where(search_condition)
    
    count_result = await db.execute(count_query)
    total = len(count_result.scalars().all())
    
    query = query.offset(skip).limit(limit).order_by(Employee.id)
    result = await db.execute(query)
    employees = result.scalars().all()
    
    return list(employees), total


async def get_employee(db: AsyncSession, emp_id: int) -> Optional[Employee]:
    result = await db.execute(
        select(Employee).options(selectinload(Employee.department))
        .where(Employee.id == emp_id)
    )
    return result.scalar_one_or_none()


async def create_employee(db: AsyncSession, emp_in: EmployeeCreate) -> Employee:
    emp = Employee(**emp_in.model_dump())
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return emp


async def update_employee(db: AsyncSession, emp_id: int, emp_in: EmployeeUpdate) -> Optional[Employee]:
    emp = await get_employee(db, emp_id)
    if not emp:
        return None
    update_data = emp_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(emp, key, value)
    await db.commit()
    await db.refresh(emp)
    return emp


async def delete_employee(db: AsyncSession, emp_id: int) -> bool:
    emp = await get_employee(db, emp_id)
    if not emp:
        return False
    await db.delete(emp)
    await db.commit()
    return True


async def search_employees(db: AsyncSession, keyword: str) -> List[EmployeeSearchResult]:
    search_pattern = f"%{keyword}%"
    result = await db.execute(
        select(Employee).options(selectinload(Employee.department))
        .where(
            (Employee.name.like(search_pattern)) |
            (Employee.email.like(search_pattern)) |
            (Employee.phone.like(search_pattern)) |
            (Employee.position.like(search_pattern))
        )
        .limit(50)
    )
    employees = result.scalars().all()
    return [
        EmployeeSearchResult(
            id=emp.id,
            name=emp.name,
            email=emp.email,
            phone=emp.phone,
            position=emp.position,
            department_name=emp.department.name if emp.department else None
        )
        for emp in employees
    ]
