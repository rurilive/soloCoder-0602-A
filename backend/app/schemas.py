from datetime import datetime

from pydantic import BaseModel, EmailStr


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: int | None = None


class UserCreate(BaseModel):
    username: str
    email: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    avatar: str | None = None
    role: str
    is_muted: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    email: str | None = None
    avatar: str | None = None


class SectionCreate(BaseModel):
    name: str
    description: str | None = None
    sort_order: int = 0


class SectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None


class SectionResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PostCreate(BaseModel):
    title: str
    content: str


class PostUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


class AuthorBrief(BaseModel):
    id: int
    username: str
    avatar: str | None = None

    model_config = {"from_attributes": True}


class ReplyResponse(BaseModel):
    id: int
    content: str
    post_id: int
    author_id: int
    author: AuthorBrief
    is_deleted: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PostResponse(BaseModel):
    id: int
    title: str
    content: str
    section_id: int
    author_id: int
    author: AuthorBrief
    is_pinned: bool
    is_deleted: bool
    view_count: int
    created_at: datetime
    updated_at: datetime
    replies: list[ReplyResponse] = []

    model_config = {"from_attributes": True}


class PostListResponse(BaseModel):
    id: int
    title: str
    section_id: int
    author_id: int
    author: AuthorBrief
    is_pinned: bool
    is_deleted: bool
    view_count: int
    reply_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReplyCreate(BaseModel):
    content: str


class ModeratorCreate(BaseModel):
    user_id: int
    section_id: int


class ModeratorResponse(BaseModel):
    id: int
    user_id: int
    section_id: int
    user: AuthorBrief

    model_config = {"from_attributes": True}


class MuteUpdate(BaseModel):
    is_muted: bool


class SectionBrief(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class PostSearchItem(BaseModel):
    id: int
    title: str
    content: str
    section_id: int
    section: SectionBrief
    author_id: int
    author: AuthorBrief
    is_pinned: bool
    view_count: int
    reply_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaginatedResponse(BaseModel):
    items: list[PostSearchItem]
    total: int
    skip: int
    limit: int
