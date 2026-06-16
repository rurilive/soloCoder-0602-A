from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar: Mapped[str | None] = mapped_column(String(200), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    is_muted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reputation: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    posts: Mapped[list["Post"]] = relationship("Post", back_populates="author", lazy="selectin")
    replies: Mapped[list["Reply"]] = relationship("Reply", back_populates="author", lazy="selectin")
    reputation_logs: Mapped[list["ReputationLog"]] = relationship("ReputationLog", foreign_keys="ReputationLog.user_id", back_populates="user", lazy="selectin")


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    posts: Mapped[list["Post"]] = relationship("Post", back_populates="section", lazy="selectin")
    moderators: Mapped[list["Moderator"]] = relationship("Moderator", back_populates="section", lazy="selectin")


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    section_id: Mapped[int] = mapped_column(Integer, ForeignKey("sections.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_pending_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    section: Mapped["Section"] = relationship("Section", back_populates="posts")
    author: Mapped["User"] = relationship("User", back_populates="posts")
    replies: Mapped[list["Reply"]] = relationship("Reply", back_populates="post", lazy="selectin")


class Reply(Base):
    __tablename__ = "replies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("replies.id"), nullable=True)
    floor_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_pending_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    post: Mapped["Post"] = relationship("Post", back_populates="replies")
    author: Mapped["User"] = relationship("User", back_populates="replies")
    parent: Mapped["Reply | None"] = relationship("Reply", remote_side=[id], back_populates="children", lazy="selectin")
    children: Mapped[list["Reply"]] = relationship("Reply", back_populates="parent", lazy="selectin")


class Moderator(Base):
    __tablename__ = "moderators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    section_id: Mapped[int] = mapped_column(Integer, ForeignKey("sections.id"), nullable=False)

    user: Mapped["User"] = relationship("User", lazy="selectin")
    section: Mapped["Section"] = relationship("Section", back_populates="moderators")


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "post_id", name="uq_favorite_user_post"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship("User", lazy="selectin")
    post: Mapped["Post"] = relationship("Post", lazy="selectin")


class Mention(Base):
    __tablename__ = "mentions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id"), nullable=False)
    reply_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("replies.id"), nullable=True)
    mentioned_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    mentioned_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    post: Mapped["Post"] = relationship("Post", lazy="selectin")
    reply: Mapped["Reply | None"] = relationship("Reply", lazy="selectin")
    mentioned_by: Mapped["User"] = relationship("User", foreign_keys=[mentioned_by_id], lazy="selectin")
    mentioned_user: Mapped["User"] = relationship("User", foreign_keys=[mentioned_user_id], lazy="selectin")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    post_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("posts.id"), nullable=True)
    reply_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("replies.id"), nullable=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="selectin")
    actor: Mapped["User | None"] = relationship("User", foreign_keys=[actor_id], lazy="selectin")
    post: Mapped["Post | None"] = relationship("Post", lazy="selectin")
    reply: Mapped["Reply | None"] = relationship("Reply", lazy="selectin")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_group: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    members: Mapped[list["ConversationMember"]] = relationship("ConversationMember", back_populates="conversation", lazy="selectin")
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="conversation", lazy="selectin")


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conversation_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    last_read_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="members")
    user: Mapped["User"] = relationship("User", lazy="selectin")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id"), nullable=False)
    sender_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
    sender: Mapped["User"] = relationship("User", lazy="selectin")


class PostRevision(Base):
    __tablename__ = "post_revisions"
    __table_args__ = (
        UniqueConstraint("post_id", "version", name="uq_post_revisions_post_id_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    editor_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    edit_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    post: Mapped["Post"] = relationship("Post", lazy="selectin")
    editor: Mapped["User"] = relationship("User", lazy="selectin")


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("reporter_id", "target_type", "target_id", name="uq_report_user_target"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reporter_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    target_type: Mapped[str] = mapped_column(String(10), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    report_type: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    reviewer_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    reporter: Mapped["User"] = relationship("User", foreign_keys=[reporter_id], lazy="selectin")
    reviewer: Mapped["User | None"] = relationship("User", foreign_keys=[reviewer_id], lazy="selectin")


class ReputationLog(Base):
    __tablename__ = "reputation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    change: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    reason_type: Mapped[str] = mapped_column(String(50), nullable=False)
    operator_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    post_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("posts.id"), nullable=True)
    reply_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("replies.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], back_populates="reputation_logs", lazy="selectin")
    operator: Mapped["User | None"] = relationship("User", foreign_keys=[operator_id], lazy="selectin")
    post: Mapped["Post | None"] = relationship("Post", lazy="selectin")
    reply: Mapped["Reply | None"] = relationship("Reply", lazy="selectin")


class SensitiveWord(Base):
    __tablename__ = "sensitive_words"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    word: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Reward(Base):
    __tablename__ = "rewards"
    __table_args__ = (
        UniqueConstraint("giver_id", "post_id", name="uq_reward_giver_post"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    giver_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    receiver_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id"), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    received_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    giver: Mapped["User"] = relationship("User", foreign_keys=[giver_id], lazy="selectin")
    receiver: Mapped["User"] = relationship("User", foreign_keys=[receiver_id], lazy="selectin")
    post: Mapped["Post"] = relationship("Post", lazy="selectin")
