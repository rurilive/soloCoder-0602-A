from app.database import SessionLocal, engine, Base
from app import models, auth

Base.metadata.create_all(bind=engine)

db = SessionLocal()

try:
    teacher_exists = db.query(models.User).filter(models.User.username == "teacher").first()
    if not teacher_exists:
        teacher = models.User(
            username="teacher",
            hashed_password=auth.get_password_hash("123456"),
            role="teacher",
            name="张老师"
        )
        db.add(teacher)

    student1_exists = db.query(models.User).filter(models.User.username == "student1").first()
    if not student1_exists:
        student1 = models.User(
            username="student1",
            hashed_password=auth.get_password_hash("123456"),
            role="student",
            name="学生甲"
        )
        db.add(student1)

    student2_exists = db.query(models.User).filter(models.User.username == "student2").first()
    if not student2_exists:
        student2 = models.User(
            username="student2",
            hashed_password=auth.get_password_hash("123456"),
            role="student",
            name="学生乙"
        )
        db.add(student2)

    sample_questions = [
        {
            "question_type": "single",
            "content": "Python中，以下哪个是不可变类型？",
            "options": ["列表", "字典", "元组", "集合"],
            "answer": [2],
            "score": 10
        },
        {
            "question_type": "single",
            "content": "HTTP状态码404表示什么？",
            "options": ["服务器内部错误", "请求成功", "资源未找到", "请求被拒绝"],
            "answer": [2],
            "score": 10
        },
        {
            "question_type": "multiple",
            "content": "以下哪些是Python的内置数据类型？（多选）",
            "options": ["int", "string", "float", "array"],
            "answer": [0, 1, 2],
            "score": 10
        },
        {
            "question_type": "multiple",
            "content": "以下哪些是前端框架？（多选）",
            "options": ["React", "Django", "Vue", "Flask"],
            "answer": [0, 2],
            "score": 10
        },
        {
            "question_type": "true_false",
            "content": "Python是一种强类型语言。",
            "options": ["正确", "错误"],
            "answer": [0],
            "score": 10
        },
        {
            "question_type": "true_false",
            "content": "HTML是一种编程语言。",
            "options": ["正确", "错误"],
            "answer": [1],
            "score": 10
        },
        {
            "question_type": "programming",
            "content": "编写一个Python程序，读取两个整数a和b，输出它们的和。\n\n输入格式：\n第一行是整数a\n第二行是整数b\n\n输出格式：\n输出a + b的结果",
            "code_template": "# 请在此处编写代码\na = int(input())\nb = int(input())\n",
            "test_cases": [
                {"input": "3\n5\n", "output": "8", "score": 5, "is_sample": True},
                {"input": "10\n20\n", "output": "30", "score": 5, "is_sample": True},
                {"input": "-1\n1\n", "output": "0", "score": 5, "is_sample": False},
                {"input": "0\n0\n", "output": "0", "score": 5, "is_sample": False}
            ],
            "time_limit": 5,
            "memory_limit": 256,
            "score": 20
        },
        {
            "question_type": "programming",
            "content": "编写一个Python程序，读取一行整数（用空格分隔），输出其中的最大值。\n\n输入格式：\n一行，包含多个整数，用空格分隔\n\n输出格式：\n输出最大值",
            "code_template": "# 请在此处编写代码\nnumbers = list(map(int, input().split()))\n",
            "test_cases": [
                {"input": "1 3 5 2 4\n", "output": "5", "score": 10, "is_sample": True},
                {"input": "-1 -5 -3\n", "output": "-1", "score": 10, "is_sample": False}
            ],
            "time_limit": 5,
            "memory_limit": 256,
            "score": 20
        },
    ]

    for q_data in sample_questions:
        q_exists = db.query(models.Question).filter(models.Question.content == q_data["content"]).first()
        if not q_exists:
            question = models.Question(**q_data)
            db.add(question)

    db.commit()
    print("初始化数据完成！")
    print("默认账号：")
    print("教师 - 用户名: teacher, 密码: 123456")
    print("学生 - 用户名: student1, 密码: 123456")
    print("学生 - 用户名: student2, 密码: 123456")

except Exception as e:
    db.rollback()
    print(f"初始化失败: {e}")
finally:
    db.close()
