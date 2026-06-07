from sqlalchemy import Column, Integer, String, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.database import Base
from app.models import UserRole


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    email = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    position = Column(String(100), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    hire_date = Column(Date, nullable=True)
    avatar = Column(String(255), nullable=True)
    role = Column(String(20), nullable=False, default=UserRole.EMPLOYEE)
    password_hash = Column(String(255), nullable=True)

    department = relationship("Department", back_populates="employees")
