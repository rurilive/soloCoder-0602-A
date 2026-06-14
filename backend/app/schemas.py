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
    parent_id: int | None = None
    floor_number: int
    is_deleted: bool
    created_at: datetime
    children: list["ReplyResponse"] = []

    model_config = {"from_attributes": True}


ReplyResponse.model_rebuild()


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
    is_favorited: bool = False

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
    parent_id: int | None = None


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


class FavoritePostItem(BaseModel):
    id: int
    title: str
    section_id: int
    author_id: int
    author: AuthorBrief
    section: SectionBrief
    is_pinned: bool
    view_count: int
    reply_count: int = 0
    created_at: datetime
    favorited_at: datetime

    model_config = {"from_attributes": True}


class PaginatedFavoritesResponse(BaseModel):
    items: list[FavoritePostItem]
    total: int
    skip: int
    limit: int


class NotificationResponse(BaseModel):
    id: int
    type: str
    content: str
    post_id: int | None = None
    reply_id: int | None = None
    actor: AuthorBrief | None = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedNotificationsResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    skip: int
    limit: int


class UnreadCountResponse(BaseModel):
    count: int


class ConversationCreate(BaseModel):
    member_ids: list[int]
    name: str | None = None


class ConversationResponse(BaseModel):
    id: int
    name: str | None = None
    is_group: bool
    created_at: datetime
    members: list[AuthorBrief] = []
    unread_count: int = 0
    last_message: "MessageResponse | None" = None

    model_config = {"from_attributes": True}


class ConversationListResponse(BaseModel):
    items: list[ConversationResponse]
    total: int


class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    sender: AuthorBrief
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageListResponse(BaseModel):
    items: list[MessageResponse]
    total: int


class MessageCreate(BaseModel):
    content: str


class UnreadConversationsCountResponse(BaseModel):
    count: int


class PaginatedRepliesResponse(BaseModel):
    items: list[ReplyResponse]
    total: int
    skip: int
    limit: int
