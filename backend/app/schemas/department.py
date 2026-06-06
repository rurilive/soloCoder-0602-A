from pydantic import BaseModel, Field
from typing import Optional, List


class DepartmentBase(BaseModel):
    name: str = Field(..., max_length=100)
    parent_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=500)


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    parent_id: Optional[int] = None
    description: Optional[str] = Field(None, max_length=500)


class DepartmentResponse(DepartmentBase):
    id: int
    children: List["DepartmentResponse"] = []
    employee_count: int = 0

    class Config:
        from_attributes = True


DepartmentResponse.model_rebuild()
