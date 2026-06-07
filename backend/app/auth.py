from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Set
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import get_db
from app.models.employee import Employee
from app.models import UserRole
from app.services import department_service

SECRET_KEY = "your-secret-key-change-in-production-please-use-a-strong-random-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


class JWTBearer(HTTPBearer):
    def __init__(self, auto_error: bool = True):
        super().__init__(auto_error=auto_error)

    async def __call__(self, request: Request) -> Dict[str, Any]:
        credentials: HTTPAuthorizationCredentials = await super().__call__(request)
        if credentials:
            if not credentials.scheme == "Bearer":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="无效的认证方案"
                )
            try:
                payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
                employee_id_str = payload.get("sub")
                role: str = payload.get("role")
                department_id: Optional[int] = payload.get("department_id")
                if employee_id_str is None or role is None:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="无效的令牌凭证"
                    )
                employee_id = int(employee_id_str)
                return {
                    "employee_id": employee_id,
                    "role": role,
                    "department_id": department_id
                }
            except JWTError:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="无效的令牌或已过期"
                )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="缺少认证凭证"
        )


async def get_current_user(
    credentials: Dict[str, Any] = Depends(JWTBearer()),
    db: AsyncSession = Depends(get_db)
) -> Employee:
    employee_id = credentials["employee_id"]
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    return employee


async def get_accessible_department_ids(
    db: AsyncSession,
    user: Employee
) -> Optional[Set[int]]:
    if user.role in (UserRole.ADMIN, UserRole.HR):
        return None
    if user.department_id is None:
        return set()
    return await department_service.get_all_child_department_ids(db, user.department_id)
