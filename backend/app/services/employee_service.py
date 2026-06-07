from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.orm import selectinload
from typing import List, Optional, Tuple, Set
from app.models.employee import Employee
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeSearchResult
from app.services import department_service
from app.utils import escape_like_pattern


async def get_employees(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    department_id: Optional[int] = None,
    search: Optional[str] = None
) -> Tuple[List[Employee], int]:
    query = select(Employee).options(selectinload(Employee.department))
    count_query = select(func.count(Employee.id))
    
    if department_id is not None:
        dept_ids = await department_service.get_all_child_department_ids(db, department_id)
        query = query.where(Employee.department_id.in_(dept_ids))
        count_query = count_query.where(Employee.department_id.in_(dept_ids))
    
    if search:
        escaped_search = escape_like_pattern(search)
        search_pattern = f"%{escaped_search}%"
        search_condition = (
            (Employee.name.like(search_pattern, escape="\\")) |
            (Employee.email.like(search_pattern, escape="\\")) |
            (Employee.phone.like(search_pattern, escape="\\")) |
            (Employee.position.like(search_pattern, escape="\\"))
        )
        query = query.where(search_condition)
        count_query = count_query.where(search_condition)
    
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()
    
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
    from app.models import UserRole
    emp_data = emp_in.model_dump()
    emp_data["role"] = UserRole.EMPLOYEE
    emp = Employee(**emp_data)
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return emp


async def update_employee(db: AsyncSession, emp_id: int, emp_in: EmployeeUpdate) -> Optional[Employee]:
    emp = await get_employee(db, emp_id)
    if not emp:
        return None
    update_data = emp_in.model_dump(exclude_unset=True)
    update_data.pop("role", None)
    for key, value in update_data.items():
        setattr(emp, key, value)
    await db.commit()
    await db.refresh(emp)
    return emp


async def update_employee_role(db: AsyncSession, emp_id: int, role: str) -> Optional[Employee]:
    emp = await get_employee(db, emp_id)
    if not emp:
        return None
    emp.role = role
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
    escaped_keyword = escape_like_pattern(keyword)
    search_pattern = f"%{escaped_keyword}%"
    result = await db.execute(
        select(Employee).options(selectinload(Employee.department))
        .where(
            (Employee.name.like(search_pattern, escape="\\")) |
            (Employee.email.like(search_pattern, escape="\\")) |
            (Employee.phone.like(search_pattern, escape="\\")) |
            (Employee.position.like(search_pattern, escape="\\"))
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


async def get_employees_by_dept_ids(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    dept_ids: Optional[Set[int]] = None,
    search: Optional[str] = None
) -> Tuple[List[Employee], int]:
    query = select(Employee).options(selectinload(Employee.department))
    count_query = select(func.count(Employee.id))
    
    if dept_ids is not None:
        query = query.where(Employee.department_id.in_(dept_ids))
        count_query = count_query.where(Employee.department_id.in_(dept_ids))
    
    if search:
        escaped_search = escape_like_pattern(search)
        search_pattern = f"%{escaped_search}%"
        search_condition = (
            (Employee.name.like(search_pattern, escape="\\")) |
            (Employee.email.like(search_pattern, escape="\\")) |
            (Employee.phone.like(search_pattern, escape="\\")) |
            (Employee.position.like(search_pattern, escape="\\"))
        )
        query = query.where(search_condition)
        count_query = count_query.where(search_condition)
    
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()
    
    query = query.offset(skip).limit(limit).order_by(Employee.id)
    result = await db.execute(query)
    employees = result.scalars().all()
    
    return list(employees), total


async def search_employees_by_dept_ids(
    db: AsyncSession,
    keyword: str,
    dept_ids: Set[int]
) -> List[EmployeeSearchResult]:
    escaped_keyword = escape_like_pattern(keyword)
    search_pattern = f"%{escaped_keyword}%"
    result = await db.execute(
        select(Employee).options(selectinload(Employee.department))
        .where(
            Employee.department_id.in_(dept_ids),
            (
                (Employee.name.like(search_pattern, escape="\\")) |
                (Employee.email.like(search_pattern, escape="\\")) |
                (Employee.phone.like(search_pattern, escape="\\")) |
                (Employee.position.like(search_pattern, escape="\\"))
            )
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
