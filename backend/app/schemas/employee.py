from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import date


class EmployeeBase(BaseModel):
    name: str = Field(..., max_length=50)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    position: Optional[str] = Field(None, max_length=100)
    department_id: Optional[int] = None
    hire_date: Optional[date] = None
    avatar: Optional[str] = Field(None, max_length=255)


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    position: Optional[str] = Field(None, max_length=100)
    department_id: Optional[int] = None
    hire_date: Optional[date] = None
    avatar: Optional[str] = Field(None, max_length=255)


class EmployeeResponse(EmployeeBase):
    id: int
    department_name: Optional[str] = None

    class Config:
        from_attributes = True


class EmployeeSearchResult(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    department_name: Optional[str] = None
