import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload, selectinload

from app.auth import get_current_user, get_optional_current_user
from app.database import get_db
from app.models import Favorite, Moderator, Notification, Post, Reply, Section, User
from app.schemas import (
    AuthorBrief,
    PaginatedResponse,
    PostCreate,
    PostListResponse,
    PostResponse,
    PostSearchItem,
    PostUpdate,
    ReplyCreate,
    ReplyResponse,
    SectionBrief,
)
from app.services.notification import create_notifications

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
async def get_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
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

    is_favorited = False
    if current_user is not None:
        fav_result = await db.execute(
            select(Favorite).where(
                Favorite.user_id == current_user.id,
                Favorite.post_id == post_id,
            )
        )
        is_favorited = fav_result.scalar_one_or_none() is not None

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
        is_favorited=is_favorited,
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
        select(Post).where(Post.id == post_id, Post.is_deleted == False).options(selectinload(Post.author))
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    reply = Reply(
        content=reply_data.content,
        post_id=post_id,
        author_id=current_user.id,
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)

    await create_notifications(db, post, reply, current_user, reply_data.content)

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


@router.get("/posts/search", response_model=PaginatedResponse)
async def search_posts(
    q: str,
    skip: int = 0,
    limit: int = 20,
    section_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip 不能为负数")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1-100 之间")
    if len(q) > 100:
        raise HTTPException(status_code=400, detail="搜索关键词不能超过100个字符")

    if not q.strip():
        return PaginatedResponse(items=[], total=0, skip=skip, limit=limit)

    keyword = f"%{q.strip()}%"

    base_where = [
        Post.is_deleted == False,
        (Post.title.ilike(keyword) | Post.content.ilike(keyword)),
    ]
    if section_id is not None:
        base_where.append(Post.section_id == section_id)

    count_stmt = select(func.count(Post.id)).where(*base_where)
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    reply_count_subq = (
        select(
            Reply.post_id.label("rc_post_id"),
            func.count(Reply.id).label("rc_count"),
        )
        .where(Reply.is_deleted == False)
        .group_by(Reply.post_id)
        .subquery()
    )

    filtered_posts = (
        select(
            Post.id.label("fp_id"),
            func.coalesce(reply_count_subq.c.rc_count, 0).label("reply_count"),
        )
        .join(reply_count_subq, Post.id == reply_count_subq.c.rc_post_id, isouter=True)
        .where(*base_where)
        .order_by(Post.created_at.desc())
        .offset(skip)
        .limit(limit)
        .subquery()
    )

    stmt = (
        select(Post, filtered_posts.c.reply_count)
        .join(filtered_posts, Post.id == filtered_posts.c.fp_id)
        .join(Post.author, isouter=True)
        .join(Post.section, isouter=True)
        .options(contains_eager(Post.author), contains_eager(Post.section))
        .order_by(Post.created_at.desc())
    )

    result = await db.execute(stmt)
    rows = result.unique().all()

    items = []
    for post, reply_count in rows:
        items.append(
            PostSearchItem(
                id=post.id,
                title=post.title,
                content=post.content,
                section_id=post.section_id,
                section=SectionBrief(
                    id=post.section.id if post.section else post.section_id,
                    name=post.section.name if post.section else "未知板块",
                ),
                author_id=post.author_id,
                author=AuthorBrief(
                    id=post.author.id if post.author else post.author_id,
                    username=post.author.username if post.author else "未知用户",
                    avatar=post.author.avatar if post.author else None,
                ),
                is_pinned=post.is_pinned,
                view_count=post.view_count,
                reply_count=reply_count,
                created_at=post.created_at,
                updated_at=post.updated_at,
            )
        )

    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)


@router.post("/posts/{post_id}/favorite")
async def favorite_post(
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

    result = await db.execute(
        select(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.post_id == post_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="已收藏该帖子")

    favorite = Favorite(user_id=current_user.id, post_id=post_id)
    db.add(favorite)
    await db.commit()
    return {"message": "收藏成功", "favorited": True}


@router.delete("/posts/{post_id}/favorite")
async def unfavorite_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.post_id == post_id,
        )
    )
    favorite = result.scalar_one_or_none()
    if not favorite:
        raise HTTPException(status_code=400, detail="未收藏该帖子")

    await db.delete(favorite)
    await db.commit()
    return {"message": "取消收藏成功", "favorited": False}
