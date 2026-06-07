from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional, Set
from app.models.department import Department
from app.models.employee import Employee
from app.schemas.department import DepartmentCreate, DepartmentUpdate


def collect_dept_ids_from_tree(tree: List[dict], target_id: int) -> Set[int]:
    result = set()
    
    def find_and_collect(nodes: List[dict]) -> bool:
        for node in nodes:
            if node["id"] == target_id:
                collect_all_ids([node])
                return True
            if node.get("children") and find_and_collect(node["children"]):
                return True
        return False
    
    def collect_all_ids(nodes: List[dict]):
        for node in nodes:
            result.add(node["id"])
            if node.get("children"):
                collect_all_ids(node["children"])
    
    find_and_collect(tree)
    return result


async def build_dept_tree(depts: List[Department], parent_id: Optional[int] = None) -> List[dict]:
    tree = []
    for dept in depts:
        if dept.parent_id == parent_id:
            children = await build_dept_tree(depts, dept.id)
            child_employee_count = sum(child["employee_count"] for child in children)
            total_employee_count = len(dept.employees) + child_employee_count
            tree.append({
                "id": dept.id,
                "name": dept.name,
                "parent_id": dept.parent_id,
                "description": dept.description,
                "children": children,
                "employee_count": total_employee_count
            })
    return tree


async def get_all_departments(db: AsyncSession) -> List[dict]:
    result = await db.execute(
        select(Department).options(selectinload(Department.employees), selectinload(Department.children))
    )
    depts = result.scalars().all()
    return await build_dept_tree(list(depts))


async def get_all_child_department_ids(db: AsyncSession, dept_id: int) -> Set[int]:
    tree = await get_all_departments(db)
    return collect_dept_ids_from_tree(tree, dept_id)


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
