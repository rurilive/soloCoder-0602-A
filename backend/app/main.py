from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import auth, questions, exams, students

Base.metadata.create_all(bind=engine)

app = FastAPI(title="在线考试系统API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(questions.router)
app.include_router(exams.router)
app.include_router(students.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "在线考试系统API运行中"}
