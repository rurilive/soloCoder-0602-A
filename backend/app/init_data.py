from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.models.department import Department
from app.models.employee import Employee
from sqlalchemy.future import select
from datetime import date


async def init_demo_data():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Department).limit(1))
        has_data = result.scalar_one_or_none()
        if has_data:
            return
        
        root = Department(name="总公司", description="企业总部")
        db.add(root)
        await db.flush()
        
        tech = Department(name="技术部", parent_id=root.id, description="技术研发中心")
        sales = Department(name="销售部", parent_id=root.id, description="市场营销与销售")
        hr = Department(name="人力资源部", parent_id=root.id, description="人事与行政")
        finance = Department(name="财务部", parent_id=root.id, description="财务管理")
        
        db.add_all([tech, sales, hr, finance])
        await db.flush()
        
        frontend = Department(name="前端组", parent_id=tech.id)
        backend = Department(name="后端组", parent_id=tech.id)
        test = Department(name="测试组", parent_id=tech.id)
        
        db.add_all([frontend, backend, test])
        await db.flush()
        
        employees = [
            Employee(name="张三", email="zhangsan@example.com", phone="13800138001", position="技术总监", department_id=tech.id, hire_date=date(2020, 1, 15)),
            Employee(name="李四", email="lisi@example.com", phone="13800138002", position="前端工程师", department_id=frontend.id, hire_date=date(2021, 3, 20)),
            Employee(name="王五", email="wangwu@example.com", phone="13800138003", position="前端工程师", department_id=frontend.id, hire_date=date(2022, 5, 10)),
            Employee(name="赵六", email="zhaoliu@example.com", phone="13800138004", position="后端工程师", department_id=backend.id, hire_date=date(2020, 8, 1)),
            Employee(name="钱七", email="qianqi@example.com", phone="13800138005", position="后端工程师", department_id=backend.id, hire_date=date(2021, 11, 25)),
            Employee(name="孙八", email="sunba@example.com", phone="13800138006", position="测试工程师", department_id=test.id, hire_date=date(2022, 2, 14)),
            Employee(name="周九", email="zhoujiu@example.com", phone="13800138007", position="销售总监", department_id=sales.id, hire_date=date(2019, 6, 30)),
            Employee(name="吴十", email="wushi@example.com", phone="13800138008", position="销售经理", department_id=sales.id, hire_date=date(2021, 1, 18)),
            Employee(name="郑十一", email="zheng11@example.com", phone="13800138009", position="HR经理", department_id=hr.id, hire_date=date(2020, 4, 22)),
            Employee(name="王十二", email="wang12@example.com", phone="13800138010", position="财务总监", department_id=finance.id, hire_date=date(2018, 9, 1)),
        ]
        
        db.add_all(employees)
        await db.commit()
