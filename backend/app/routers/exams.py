from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from ..database import get_db
from .. import models, schemas, auth

router = APIRouter(prefix="/api/exams", tags=["考试"])


@router.post("/", response_model=schemas.ExamResponse)
def create_exam(
    exam: schemas.ExamCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_teacher)
):
    db_exam = models.Exam(
        title=exam.title,
        description=exam.description,
        creator_id=current_user.id,
        start_time=exam.start_time,
        end_time=exam.end_time,
        duration=exam.duration,
        total_score=exam.total_score
    )
    db.add(db_exam)
    db.flush()

    for idx, question_id in enumerate(exam.question_ids):
        question = db.query(models.Question).filter(models.Question.id == question_id).first()
        if not question:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"题目 {question_id} 不存在")
        exam_question = models.ExamQuestion(
            exam_id=db_exam.id,
            question_id=question_id,
            order=idx
        )
        db.add(exam_question)

    for student_id in exam.student_ids:
        student = db.query(models.User).filter(models.User.id == student_id, models.User.role == "student").first()
        if not student:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"学生 {student_id} 不存在")
        participation = models.ExamParticipation(
            exam_id=db_exam.id,
            student_id=student_id,
            status="pending"
        )
        db.add(participation)

    db.commit()
    db.refresh(db_exam)
    return db_exam


@router.get("/", response_model=List[schemas.ExamResponse])
def list_exams(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role == "teacher":
        exams = db.query(models.Exam).filter(models.Exam.creator_id == current_user.id).all()
    else:
        exams = db.query(models.Exam).join(models.ExamParticipation).filter(
            models.ExamParticipation.student_id == current_user.id
        ).all()
    return exams


@router.get("/{exam_id}", response_model=schemas.ExamDetailResponse)
def get_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="考试不存在")

    if current_user.role == "student":
        participation = db.query(models.ExamParticipation).filter(
            models.ExamParticipation.exam_id == exam_id,
            models.ExamParticipation.student_id == current_user.id
        ).first()
        if not participation:
            raise HTTPException(status_code=403, detail="无权访问此考试")

    exam_questions = db.query(models.ExamQuestion).filter(
        models.ExamQuestion.exam_id == exam_id
    ).order_by(models.ExamQuestion.order).all()
    questions = [eq.question for eq in exam_questions]

    participations = db.query(models.ExamParticipation).filter(
        models.ExamParticipation.exam_id == exam_id
    ).all()

    result = {
        **exam.__dict__,
        "questions": questions,
        "participations": participations,
        "creator": exam.creator
    }
    return result


@router.delete("/{exam_id}")
def delete_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_teacher)
):
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="考试不存在")
    if exam.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权删除此考试")
    db.delete(exam)
    db.commit()
    return {"message": "删除成功"}


@router.get("/{exam_id}/participations", response_model=List[schemas.ExamParticipationResponse])
def get_exam_participations(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_teacher)
):
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="考试不存在")
    if exam.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看此考试")

    participations = db.query(models.ExamParticipation).filter(
        models.ExamParticipation.exam_id == exam_id
    ).all()
    return participations
