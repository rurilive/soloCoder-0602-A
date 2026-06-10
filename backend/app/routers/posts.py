from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Moderator, Post, Reply, Section, User
from app.schemas import (
    AuthorBrief,
    PostCreate,
    PostListResponse,
    PostResponse,
    PostUpdate,
    ReplyCreate,
    ReplyResponse,
)

router = APIRouter(prefix="/api", tags=["posts"])


def _can_moderate(user: User, section_id: int, moderators: list[Moderator]) -> bool:
    if user.role == "admin":
        return True
    if user.role == "moderator":
        for mod in moderators:
            if mod.user_id == user.id and mod.section_id == section_id:
                return True
    return False


@router.get("/sections/{section_id}/posts", response_model=list[PostListResponse])
async def list_posts(
    section_id: int,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Section).where(Section.id == section_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="板块不存在")

    stmt = (
        select(Post)
        .where(Post.section_id == section_id, Post.is_deleted == False)
        .order_by(Post.is_pinned.desc(), Post.created_at.desc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(Post.author))
    )
    result = await db.execute(stmt)
    posts = result.scalars().all()

    response = []
    for post in posts:
        reply_count_result = await db.execute(
            select(func.count(Reply.id)).where(
                Reply.post_id == post.id, Reply.is_deleted == False
            )
        )
        reply_count = reply_count_result.scalar() or 0

        response.append(
            PostListResponse(
                id=post.id,
                title=post.title,
                section_id=post.section_id,
                author_id=post.author_id,
                author=AuthorBrief(
                    id=post.author.id,
                    username=post.author.username,
                    avatar=post.author.avatar,
                ),
                is_pinned=post.is_pinned,
                is_deleted=post.is_deleted,
                view_count=post.view_count,
                reply_count=reply_count,
                created_at=post.created_at,
                updated_at=post.updated_at,
            )
        )
    return response


@router.post("/sections/{section_id}/posts", response_model=PostResponse, status_code=201)
async def create_post(
    section_id: int,
    post_data: PostCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.is_muted:
        raise HTTPException(status_code=403, detail="您已被禁言，无法发帖")

    result = await db.execute(select(Section).where(Section.id == section_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="板块不存在")

    post = Post(
        title=post_data.title,
        content=post_data.content,
        section_id=section_id,
        author_id=current_user.id,
    )
    db.add(post)
    await db.commit()

    result = await db.execute(
        select(Post).where(Post.id == post.id).options(selectinload(Post.author), selectinload(Post.replies))
    )
    return result.scalar_one()


@router.get("/posts/{post_id}", response_model=PostResponse)
async def get_post(post_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Post)
        .where(Post.id == post_id, Post.is_deleted == False)
        .options(selectinload(Post.author), selectinload(Post.replies))
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    post.view_count += 1
    await db.commit()
    await db.refresh(post)

    result = await db.execute(
        select(Post)
        .where(Post.id == post_id)
        .options(
            selectinload(Post.author),
            selectinload(Post.replies).selectinload(Reply.author),
        )
    )
    post = result.scalar_one()

    reply_responses = []
    for reply in post.replies:
        if not reply.is_deleted:
            reply_responses.append(
                ReplyResponse(
                    id=reply.id,
                    content=reply.content,
                    post_id=reply.post_id,
                    author_id=reply.author_id,
                    author=AuthorBrief(
                        id=reply.author.id,
                        username=reply.author.username,
                        avatar=reply.author.avatar,
                    ),
                    is_deleted=reply.is_deleted,
                    created_at=reply.created_at,
                )
            )

    return PostResponse(
        id=post.id,
        title=post.title,
        content=post.content,
        section_id=post.section_id,
        author_id=post.author_id,
        author=AuthorBrief(
            id=post.author.id,
            username=post.author.username,
            avatar=post.author.avatar,
        ),
        is_pinned=post.is_pinned,
        is_deleted=post.is_deleted,
        view_count=post.view_count,
        created_at=post.created_at,
        updated_at=post.updated_at,
        replies=reply_responses,
    )


@router.put("/posts/{post_id}", response_model=PostResponse)
async def update_post(
    post_id: int,
    post_data: PostUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="只能编辑自己的帖子")

    if post_data.title is not None:
        post.title = post_data.title
    if post_data.content is not None:
        post.content = post_data.content

    await db.commit()

    result = await db.execute(
        select(Post)
        .where(Post.id == post_id)
        .options(
            selectinload(Post.author),
            selectinload(Post.replies).selectinload(Reply.author),
        )
    )
    post = result.scalar_one()

    reply_responses = []
    for reply in post.replies:
        if not reply.is_deleted:
            reply_responses.append(
                ReplyResponse(
                    id=reply.id,
                    content=reply.content,
                    post_id=reply.post_id,
                    author_id=reply.author_id,
                    author=AuthorBrief(
                        id=reply.author.id,
                        username=reply.author.username,
                        avatar=reply.author.avatar,
                    ),
                    is_deleted=reply.is_deleted,
                    created_at=reply.created_at,
                )
            )

    return PostResponse(
        id=post.id,
        title=post.title,
        content=post.content,
        section_id=post.section_id,
        author_id=post.author_id,
        author=AuthorBrief(
            id=post.author.id,
            username=post.author.username,
            avatar=post.author.avatar,
        ),
        is_pinned=post.is_pinned,
        is_deleted=post.is_deleted,
        view_count=post.view_count,
        created_at=post.created_at,
        updated_at=post.updated_at,
        replies=reply_responses,
    )


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    if post.author_id != current_user.id and current_user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="无权删除此帖子")

    if current_user.role == "moderator":
        mod_result = await db.execute(
            select(Moderator).where(
                Moderator.user_id == current_user.id,
                Moderator.section_id == post.section_id,
            )
        )
        if not mod_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="您不是该板块的版主")

    post.is_deleted = True
    await db.commit()
    return {"message": "帖子已删除"}


@router.post("/posts/{post_id}/pin")
async def pin_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    if current_user.role == "admin":
        post.is_pinned = not post.is_pinned
    elif current_user.role == "moderator":
        mod_result = await db.execute(
            select(Moderator).where(
                Moderator.user_id == current_user.id,
                Moderator.section_id == post.section_id,
            )
        )
        if not mod_result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="您不是该板块的版主")
        post.is_pinned = not post.is_pinned
    else:
        raise HTTPException(status_code=403, detail="需要管理员或版主权限")

    await db.commit()
    return {"message": "已置顶" if post.is_pinned else "已取消置顶"}


@router.post("/posts/{post_id}/replies", response_model=ReplyResponse, status_code=201)
async def create_reply(
    post_id: int,
    reply_data: ReplyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.is_muted:
        raise HTTPException(status_code=403, detail="您已被禁言，无法回复")

    result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="帖子不存在")

    reply = Reply(
        content=reply_data.content,
        post_id=post_id,
        author_id=current_user.id,
    )
    db.add(reply)
    await db.commit()

    result = await db.execute(
        select(Reply).where(Reply.id == reply.id).options(selectinload(Reply.author))
    )
    reply = result.scalar_one()
    return ReplyResponse(
        id=reply.id,
        content=reply.content,
        post_id=reply.post_id,
        author_id=reply.author_id,
        author=AuthorBrief(
            id=reply.author.id,
            username=reply.author.username,
            avatar=reply.author.avatar,
        ),
        is_deleted=reply.is_deleted,
        created_at=reply.created_at,
    )


@router.get("/posts/{post_id}/replies", response_model=list[ReplyResponse])
async def list_replies(
    post_id: int,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reply)
        .where(Reply.post_id == post_id, Reply.is_deleted == False)
        .order_by(Reply.created_at.asc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(Reply.author))
    )
    replies = result.scalars().all()

    return [
        ReplyResponse(
            id=reply.id,
            content=reply.content,
            post_id=reply.post_id,
            author_id=reply.author_id,
            author=AuthorBrief(
                id=reply.author.id,
                username=reply.author.username,
                avatar=reply.author.avatar,
            ),
            is_deleted=reply.is_deleted,
            created_at=reply.created_at,
        )
        for reply in replies
    ]
