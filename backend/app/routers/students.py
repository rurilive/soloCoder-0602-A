from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from pydantic import BaseModel
from ..database import get_db
from .. import models, schemas, auth
from ..judge import run_python_code

router = APIRouter(prefix="/api/student", tags=["学生端"])


class CodeRunRequest(BaseModel):
    code: str
    test_cases: List[dict]


@router.get("/exams", response_model=List[schemas.StudentExamListResponse])
def get_student_exams(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_student)
):
    participations = db.query(models.ExamParticipation).filter(
        models.ExamParticipation.student_id == current_user.id
    ).all()

    result = []
    now = datetime.utcnow()
    for p in participations:
        exam = p.exam
        status_str = "pending"
        if p.status == "submitted":
            status_str = "submitted"
        elif now < exam.start_time:
            status_str = "not_started"
        elif now > exam.end_time:
            status_str = "ended"
        elif p.status == "started":
            status_str = "in_progress"
        else:
            status_str = "available"

        result.append({
            "id": exam.id,
            "title": exam.title,
            "description": exam.description,
            "start_time": exam.start_time,
            "end_time": exam.end_time,
            "duration": exam.duration,
            "total_score": exam.total_score,
            "status": status_str,
            "participation_id": p.id,
            "score": p.score
        })
    return result


@router.post("/exams/{exam_id}/start")
def start_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_student)
):
    participation = db.query(models.ExamParticipation).filter(
        models.ExamParticipation.exam_id == exam_id,
        models.ExamParticipation.student_id == current_user.id
    ).first()

    if not participation:
        raise HTTPException(status_code=404, detail="未找到考试记录")

    if participation.status == "submitted":
        raise HTTPException(status_code=400, detail="考试已提交")

    exam = participation.exam
    now = datetime.utcnow()

    if now < exam.start_time:
        raise HTTPException(status_code=400, detail="考试尚未开始")
    if now > exam.end_time:
        raise HTTPException(status_code=400, detail="考试已结束")

    if participation.status == "pending":
        participation.started_at = now
        participation.status = "started"
        db.commit()

    exam_questions = db.query(models.ExamQuestion).filter(
        models.ExamQuestion.exam_id == exam_id
    ).order_by(models.ExamQuestion.order).all()

    questions = []
    for eq in exam_questions:
        q = eq.question
        q_data = {
            "id": q.id,
            "question_type": q.question_type,
            "content": q.content,
            "score": q.score
        }
        if q.question_type == "programming":
            q_data["code_template"] = q.code_template
            q_data["time_limit"] = q.time_limit
            q_data["memory_limit"] = q.memory_limit
            q_data["sample_test_cases"] = [tc for tc in (q.test_cases or []) if tc.get("is_sample")]
        else:
            q_data["options"] = q.options
        questions.append(q_data)

    return {
        "participation_id": participation.id,
        "exam": {
            "id": exam.id,
            "title": exam.title,
            "duration": exam.duration,
            "end_time": exam.end_time
        },
        "questions": questions,
        "started_at": participation.started_at
    }


@router.post("/exams/{exam_id}/submit")
def submit_exam(
    exam_id: int,
    submit_data: schemas.ExamSubmitRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_student)
):
    participation = db.query(models.ExamParticipation).filter(
        models.ExamParticipation.exam_id == exam_id,
        models.ExamParticipation.student_id == current_user.id
    ).first()

    if not participation:
        raise HTTPException(status_code=404, detail="未找到考试记录")

    if participation.status == "submitted":
        raise HTTPException(status_code=400, detail="考试已提交")

    exam = participation.exam
    now = datetime.utcnow()

    exam_questions = db.query(models.ExamQuestion).filter(
        models.ExamQuestion.exam_id == exam_id
    ).order_by(models.ExamQuestion.order).all()

    total_score = 0
    answers = submit_data.answers
    answers_with_judge = dict(answers)

    for eq in exam_questions:
        q = eq.question
        if q.question_type == "programming":
            user_code = answers.get(str(q.id), "")
            if q.test_cases:
                judge_result = run_python_code(
                    code=user_code,
                    test_cases=q.test_cases,
                    time_limit=q.time_limit,
                    memory_limit=q.memory_limit
                )
                total_score += judge_result["total_score"]
                answers_with_judge[f"{q.id}_judge"] = judge_result
        else:
            user_answer = answers.get(str(q.id), [])
            if not isinstance(user_answer, list):
                user_answer = [user_answer]
            correct_answer = q.answer
            if correct_answer and sorted(user_answer) == sorted(correct_answer):
                total_score += q.score

    participation.submitted_at = now
    participation.score = total_score
    participation.answers = answers_with_judge
    participation.status = "submitted"
    db.commit()

    return {
        "message": "提交成功",
        "score": total_score,
        "total_score": exam.total_score
    }


@router.get("/exams/{exam_id}/result")
def get_exam_result(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_student)
):
    participation = db.query(models.ExamParticipation).filter(
        models.ExamParticipation.exam_id == exam_id,
        models.ExamParticipation.student_id == current_user.id
    ).first()

    if not participation:
        raise HTTPException(status_code=404, detail="未找到考试记录")

    if participation.status != "submitted":
        raise HTTPException(status_code=400, detail="考试尚未完成")

    exam_questions = db.query(models.ExamQuestion).filter(
        models.ExamQuestion.exam_id == exam_id
    ).order_by(models.ExamQuestion.order).all()

    questions = []
    for eq in exam_questions:
        q = eq.question
        if q.question_type == "programming":
            user_code = participation.answers.get(str(q.id), "") if participation.answers else ""
            judge_details = participation.answers.get(f"{q.id}_judge", None) if participation.answers else None
            if judge_details:
                is_correct = judge_details["all_passed"]
                user_score = judge_details["total_score"]
            else:
                is_correct = False
                user_score = 0
            questions.append({
                "id": q.id,
                "question_type": q.question_type,
                "content": q.content,
                "score": q.score,
                "user_answer": user_code,
                "is_correct": is_correct,
                "user_score": user_score,
                "judge_details": judge_details,
                "test_cases": q.test_cases
            })
        else:
            user_answer = participation.answers.get(str(q.id), []) if participation.answers else []
            if not isinstance(user_answer, list):
                user_answer = [user_answer]
            is_correct = q.answer and sorted(user_answer) == sorted(q.answer)
            questions.append({
                "id": q.id,
                "question_type": q.question_type,
                "content": q.content,
                "options": q.options,
                "score": q.score,
                "user_answer": user_answer,
                "correct_answer": q.answer,
                "is_correct": is_correct
            })

    return {
        "exam": participation.exam,
        "score": participation.score,
        "total_score": participation.exam.total_score,
        "submitted_at": participation.submitted_at,
        "questions": questions
    }


@router.post("/run-code")
def run_code(
    request: CodeRunRequest,
    current_user: models.User = Depends(auth.get_current_user)
):
    try:
        result = run_python_code(
            code=request.code,
            test_cases=request.test_cases,
            time_limit=5,
            memory_limit=256
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/students", response_model=List[schemas.UserResponse])
def list_students(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_teacher)
):
    students = db.query(models.User).filter(models.User.role == "student").all()
    return students
