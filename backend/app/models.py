from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    role = Column(String(20), nullable=False)
    name = Column(String(100), nullable=False)

    created_exams = relationship("Exam", back_populates="creator")
    exam_participations = relationship("ExamParticipation", back_populates="student")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    question_type = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)
    answer = Column(JSON, nullable=False)
    score = Column(Integer, nullable=False, default=10)
    created_at = Column(DateTime, default=datetime.utcnow)

    exam_questions = relationship("ExamQuestion", back_populates="question")


class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    duration = Column(Integer, nullable=False)
    total_score = Column(Integer, nullable=False, default=100)
    created_at = Column(DateTime, default=datetime.utcnow)

    creator = relationship("User", back_populates="created_exams")
    exam_questions = relationship("ExamQuestion", back_populates="exam", cascade="all, delete-orphan")
    participations = relationship("ExamParticipation", back_populates="exam", cascade="all, delete-orphan")


class ExamQuestion(Base):
    __tablename__ = "exam_questions"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    order = Column(Integer, nullable=False, default=0)

    exam = relationship("Exam", back_populates="exam_questions")
    question = relationship("Question", back_populates="exam_questions")


class ExamParticipation(Base):
    __tablename__ = "exam_participations"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime)
    submitted_at = Column(DateTime)
    score = Column(Integer)
    answers = Column(JSON)
    status = Column(String(20), default="pending")

    exam = relationship("Exam", back_populates="participations")
    student = relationship("User", back_populates="exam_participations")
