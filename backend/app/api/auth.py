from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import get_db
from app.models.employee import Employee
from app.auth import verify_password, create_access_token, get_current_user
from app.permissions import permission_middleware


router = APIRouter(prefix="/api/auth", tags=["认证"])


class LoginRequest(BaseModel):
    name: str = Field(..., description="员工姓名")
    password: str = Field(..., description="密码")


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    employee: dict


@router.post("/login", response_model=LoginResponse)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Employee).where(Employee.name == login_data.name)
    )
    employee = result.scalar_one_or_none()
    
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )
    
    if not employee.password_hash:
        default_password = "123456"
        if login_data.password != default_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名或密码错误"
            )
    else:
        if not verify_password(login_data.password, employee.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名或密码错误"
            )
    
    access_token = create_access_token(
        data={
            "sub": employee.id,
            "role": employee.role,
            "department_id": employee.department_id
        }
    )
    
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        employee={
            "id": employee.id,
            "name": employee.name,
            "email": employee.email,
            "phone": employee.phone,
            "position": employee.position,
            "department_id": employee.department_id,
            "role": employee.role
        }
    )


@router.get("/me")
async def get_me(
    auth_data: tuple = Depends(permission_middleware)
):
    current_user, _ = auth_data
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "phone": current_user.phone,
        "position": current_user.position,
        "department_id": current_user.department_id,
        "department_name": current_user.department.name if current_user.department else None,
        "role": current_user.role
    }
