from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from ..database import get_db
from .. import models, schemas, auth

router = APIRouter(prefix="/api/student", tags=["学生端"])


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
        questions.append({
            "id": q.id,
            "question_type": q.question_type,
            "content": q.content,
            "options": q.options,
            "score": q.score
        })

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

    for eq in exam_questions:
        q = eq.question
        user_answer = answers.get(str(q.id), [])
        if not isinstance(user_answer, list):
            user_answer = [user_answer]
        correct_answer = q.answer
        if sorted(user_answer) == sorted(correct_answer):
            total_score += q.score

    participation.submitted_at = now
    participation.score = total_score
    participation.answers = answers
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
        user_answer = participation.answers.get(str(q.id), []) if participation.answers else []
        if not isinstance(user_answer, list):
            user_answer = [user_answer]
        is_correct = sorted(user_answer) == sorted(q.answer)
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


@router.get("/students", response_model=List[schemas.UserResponse])
def list_students(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_teacher)
):
    students = db.query(models.User).filter(models.User.role == "student").all()
    return students
