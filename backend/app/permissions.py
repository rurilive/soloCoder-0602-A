import re
from typing import Dict, Any, Set, Optional, Tuple
from fastapi import Request, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import UserRole
from app.models.employee import Employee
from app.auth import get_current_user, get_accessible_department_ids
from app.services import department_service


class PermissionConfig:
    def __init__(
        self,
        allowed_roles: Optional[Set[str]] = None,
        require_write: bool = False,
        require_import_export: bool = False,
        require_department_management: bool = False,
        require_role_management: bool = False
    ):
        self.allowed_roles = allowed_roles
        self.require_write = require_write
        self.require_import_export = require_import_export
        self.require_department_management = require_department_management
        self.require_role_management = require_role_management


ROUTE_PERMISSIONS: Dict[str, Dict[str, PermissionConfig]] = {
    "GET": {
        r"^/api/health$": PermissionConfig(),
        r"^/api/auth/login$": PermissionConfig(),
        r"^/api/auth/me$": PermissionConfig(),
        r"^/api/departments$": PermissionConfig(),
        r"^/api/departments/\d+$": PermissionConfig(),
        r"^/api/employees$": PermissionConfig(),
        r"^/api/employees/search$": PermissionConfig(),
        r"^/api/employees/\d+$": PermissionConfig(),
        r"^/api/employees/export/excel$": PermissionConfig(
            allowed_roles={UserRole.HR, UserRole.ADMIN},
            require_import_export=True
        ),
    },
    "POST": {
        r"^/api/auth/login$": PermissionConfig(),
        r"^/api/departments$": PermissionConfig(
            allowed_roles={UserRole.ADMIN},
            require_department_management=True
        ),
        r"^/api/employees$": PermissionConfig(
            allowed_roles={UserRole.MANAGER, UserRole.HR, UserRole.ADMIN},
            require_write=True
        ),
        r"^/api/employees/import/excel$": PermissionConfig(
            allowed_roles={UserRole.HR, UserRole.ADMIN},
            require_import_export=True
        ),
        r"^/api/employees/\d+/role$": PermissionConfig(
            allowed_roles={UserRole.ADMIN},
            require_role_management=True
        ),
    },
    "PUT": {
        r"^/api/departments/\d+$": PermissionConfig(
            allowed_roles={UserRole.ADMIN},
            require_department_management=True
        ),
        r"^/api/employees/\d+$": PermissionConfig(
            allowed_roles={UserRole.MANAGER, UserRole.HR, UserRole.ADMIN},
            require_write=True
        ),
    },
    "DELETE": {
        r"^/api/departments/\d+$": PermissionConfig(
            allowed_roles={UserRole.ADMIN},
            require_department_management=True
        ),
        r"^/api/employees/\d+$": PermissionConfig(
            allowed_roles={UserRole.MANAGER, UserRole.HR, UserRole.ADMIN},
            require_write=True
        ),
    }
}


def match_route_permission(method: str, path: str) -> Optional[PermissionConfig]:
    method_permissions = ROUTE_PERMISSIONS.get(method.upper(), {})
    for pattern, config in method_permissions.items():
        if re.match(pattern, path):
            return config
    return None


def has_basic_role_permission(user_role: str, config: PermissionConfig) -> bool:
    if config.allowed_roles is None:
        return True
    return user_role in config.allowed_roles


async def check_department_permission(
    db: AsyncSession,
    user: Employee,
    target_department_id: Optional[int]
) -> bool:
    if user.role in (UserRole.ADMIN, UserRole.HR):
        return True
    if user.department_id is None:
        return False
    accessible_dept_ids = await department_service.get_all_child_department_ids(
        db, user.department_id
    )
    if target_department_id is None:
        return False
    return target_department_id in accessible_dept_ids


async def check_employee_permission(
    db: AsyncSession,
    user: Employee,
    target_employee: Optional[Employee]
) -> bool:
    if user.role in (UserRole.ADMIN, UserRole.HR):
        return True
    if target_employee is None:
        return False
    return await check_department_permission(db, user, target_employee.department_id)


async def permission_middleware(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user)
) -> Tuple[Employee, AsyncSession]:
    method = request.method
    path = request.url.path

    if path in ("/api/health", "/api/auth/login"):
        return current_user, db

    permission_config = match_route_permission(method, path)
    if permission_config is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限访问该接口"
        )

    if not has_basic_role_permission(current_user.role, permission_config):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="当前角色无权限执行此操作"
        )

    return current_user, db
