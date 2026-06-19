from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, selectinload

from app.auth import get_admin_user, get_current_user, get_optional_current_user
from app.database import get_db
from app.models import Post, PostTag, Tag, User, Reply
from app.schemas import (
    AuthorBrief,
    build_tag_briefs,
    PaginatedResponse,
    PostSearchItem,
    SectionBrief,
    TagBrief,
    TagCreate,
    TagResponse,
    TagUpdate,
    TagWithPostCount,
    PaginatedTagsResponse,
)

router = APIRouter(prefix="/api/tags", tags=["tags"])


def _validate_tag_name(name: str) -> None:
    name = name.strip()
    if len(name) < 2 or len(name) > 20:
        raise HTTPException(status_code=400, detail="标签名长度必须在 2-20 个字符之间")


@router.get("/", response_model=PaginatedTagsResponse)
async def list_tags(
    skip: int = 0,
    limit: int = 20,
    keyword: str | None = None,
    sort_by: str = "created_at",
    db: AsyncSession = Depends(get_db),
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip 不能为负数")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1-100 之间")

    base_where = []
    if keyword:
        base_where.append(Tag.name.ilike(f"%{keyword}%"))

    count_stmt = select(func.count(Tag.id)).where(*base_where)
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    post_count_subq = (
        select(
            PostTag.tag_id.label("pt_tag_id"),
            func.count(PostTag.post_id).label("post_count"),
        )
        .join(Post, PostTag.post_id == Post.id)
        .where(Post.is_deleted == False)
        .group_by(PostTag.tag_id)
        .subquery()
    )

    stmt = (
        select(Tag, func.coalesce(post_count_subq.c.post_count, 0).label("post_count"))
        .join(post_count_subq, Tag.id == post_count_subq.c.pt_tag_id, isouter=True)
        .where(*base_where)
    )

    if sort_by == "post_count":
        stmt = stmt.order_by(func.coalesce(post_count_subq.c.post_count, 0).desc(), Tag.id.desc())
    elif sort_by == "name":
        stmt = stmt.order_by(Tag.name.asc())
    else:
        stmt = stmt.order_by(Tag.created_at.desc())

    stmt = stmt.offset(skip).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for tag, post_count in rows:
        items.append(
            TagWithPostCount(
                id=tag.id,
                name=tag.name,
                created_at=tag.created_at,
                post_count=post_count,
            )
        )

    return PaginatedTagsResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/search", response_model=list[TagBrief])
async def search_tags(
    q: str,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
):
    if not q.strip():
        return []
    if limit < 1 or limit > 50:
        limit = 10

    keyword = f"{q.strip()}%"
    stmt = (
        select(Tag)
        .where(Tag.name.ilike(keyword))
        .order_by(Tag.name.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    tags = result.scalars().all()
    return [TagBrief(id=tag.id, name=tag.name) for tag in tags]


@router.get("/hot", response_model=list[TagWithPostCount])
async def get_hot_tags(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    if limit < 1 or limit > 100:
        limit = 20

    post_count_subq = (
        select(
            PostTag.tag_id.label("pt_tag_id"),
            func.count(PostTag.post_id).label("post_count"),
        )
        .join(Post, PostTag.post_id == Post.id)
        .where(Post.is_deleted == False)
        .group_by(PostTag.tag_id)
        .subquery()
    )

    stmt = (
        select(Tag, post_count_subq.c.post_count.label("post_count"))
        .join(post_count_subq, Tag.id == post_count_subq.c.pt_tag_id)
        .order_by(post_count_subq.c.post_count.desc(), Tag.id.desc())
        .limit(limit)
    )

    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for tag, post_count in rows:
        items.append(
            TagWithPostCount(
                id=tag.id,
                name=tag.name,
                created_at=tag.created_at,
                post_count=post_count,
            )
        )

    return items


@router.get("/{tag_id}", response_model=TagWithPostCount)
async def get_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db),
):
    post_count_subq = (
        select(
            PostTag.tag_id.label("pt_tag_id"),
            func.count(PostTag.post_id).label("post_count"),
        )
        .join(Post, PostTag.post_id == Post.id)
        .where(Post.is_deleted == False)
        .group_by(PostTag.tag_id)
        .subquery()
    )

    stmt = (
        select(Tag, func.coalesce(post_count_subq.c.post_count, 0).label("post_count"))
        .join(post_count_subq, Tag.id == post_count_subq.c.pt_tag_id, isouter=True)
        .where(Tag.id == tag_id)
    )

    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="标签不存在")

    tag, post_count = row
    return TagWithPostCount(
        id=tag.id,
        name=tag.name,
        created_at=tag.created_at,
        post_count=post_count,
    )


@router.get("/{tag_id}/posts", response_model=PaginatedResponse)
async def get_posts_by_tag(
    tag_id: int,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip 不能为负数")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1-100 之间")

    tag_result = await db.execute(select(Tag).where(Tag.id == tag_id))
    if not tag_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="标签不存在")

    from app.auth import is_moderator as _is_moderator

    is_mod = False if current_user is None else await _is_moderator(db, current_user)

    base_where = [
        PostTag.tag_id == tag_id,
        Post.is_deleted == False,
    ]

    if not is_mod:
        if current_user is not None:
            base_where.append(or_(Post.is_hidden == False, Post.author_id == current_user.id))
            base_where.append(or_(Post.is_pending_review == False, Post.author_id == current_user.id))
            base_where.append(or_(Post.scheduled_at.is_(None), Post.author_id == current_user.id))
        else:
            base_where.append(Post.is_hidden == False)
            base_where.append(Post.is_pending_review == False)
            base_where.append(Post.scheduled_at.is_(None))

    count_stmt = (
        select(func.count(Post.id))
        .join(PostTag, Post.id == PostTag.post_id)
        .where(*base_where)
    )
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
        .join(PostTag, Post.id == PostTag.post_id)
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
        .options(
            contains_eager(Post.author),
            contains_eager(Post.section),
            selectinload(Post.tags),
        )
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
                    reputation=post.author.reputation if post.author else 0,
                ),
                is_pinned=post.is_pinned,
                is_scheduled=post.scheduled_at is not None,
                scheduled_at=post.scheduled_at,
                view_count=post.view_count,
                reply_count=reply_count,
                created_at=post.created_at,
                updated_at=post.updated_at,
                tags=build_tag_briefs(post.tags),
            )
        )

    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)


@router.post("/", response_model=TagResponse, status_code=201)
async def create_tag(
    tag_data: TagCreate,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    name = tag_data.name.strip()
    _validate_tag_name(name)

    existing_result = await db.execute(select(Tag).where(Tag.name == name))
    if existing_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该标签已存在")

    tag = Tag(name=name)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.put("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: int,
    tag_data: TagUpdate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    if tag_data.name is not None:
        name = tag_data.name.strip()
        _validate_tag_name(name)

        if name != tag.name:
            existing_result = await db.execute(select(Tag).where(Tag.name == name))
            if existing_result.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="该标签名已存在")

            tag.name = name

    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/{tag_id}")
async def delete_tag(
    tag_id: int,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    post_count_result = await db.execute(
        select(func.count(PostTag.id)).where(PostTag.tag_id == tag_id)
    )
    post_count = post_count_result.scalar() or 0
    if post_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"该标签下还有 {post_count} 篇帖子，无法删除",
        )

    await db.delete(tag)
    await db.commit()
    return {"message": "标签已删除"}
