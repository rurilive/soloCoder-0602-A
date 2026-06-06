from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime


class UserBase(BaseModel):
    username: str
    name: str
    role: str


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(UserBase):
    id: int

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class QuestionBase(BaseModel):
    question_type: str = Field(..., description="single, multiple, true_false, programming")
    content: str
    options: Optional[List[str]] = None
    answer: Optional[List[int]] = None
    score: int = 10
    code_template: Optional[str] = None
    test_cases: Optional[List[dict]] = None
    time_limit: int = 5
    memory_limit: int = 256


class QuestionCreate(QuestionBase):
    pass


class QuestionResponse(QuestionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ExamQuestionCreate(BaseModel):
    question_id: int
    order: int = 0


class ExamBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    duration: int
    total_score: int = 100


class ExamCreate(ExamBase):
    question_ids: List[int]
    student_ids: List[int]


class ExamResponse(ExamBase):
    id: int
    creator_id: int
    created_at: datetime
    creator: UserResponse

    class Config:
        from_attributes = True


class ExamDetailResponse(ExamResponse):
    questions: List[QuestionResponse] = []
    participations: List["ExamParticipationResponse"] = []


class ExamParticipationBase(BaseModel):
    pass


class ExamParticipationStart(BaseModel):
    exam_id: int


class ExamSubmitRequest(BaseModel):
    answers: dict


class ExamParticipationResponse(BaseModel):
    id: int
    exam_id: int
    student_id: int
    started_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    score: Optional[int] = None
    status: str
    student: Optional[UserResponse] = None

    class Config:
        from_attributes = True


ExamDetailResponse.model_rebuild()


class StudentExamListResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    duration: int
    total_score: int
    status: str
    participation_id: Optional[int] = None
    score: Optional[int] = None
