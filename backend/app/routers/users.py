from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from app.auth import get_admin_user, get_current_user
from app.database import get_db
from app.models import Favorite, Post, Reply, Section, User
from app.schemas import (
    AuthorBrief,
    FavoritePostItem,
    PaginatedFavoritesResponse,
    SectionBrief,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_me(
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user_data.email is not None:
        result = await db.execute(
            select(User).where(User.email == user_data.email, User.id != current_user.id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="邮箱已被使用")
        current_user.email = user_data.email

    if user_data.avatar is not None:
        current_user.avatar = user_data.avatar

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.get("/", response_model=list[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 20,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).offset(skip).limit(limit))
    return result.scalars().all()


@router.get("/by-username/{username}", response_model=AuthorBrief)
async def get_user_by_username(
    username: str,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return AuthorBrief(
        id=user.id,
        username=user.username,
        avatar=user.avatar,
    )


@router.get("/me/favorites", response_model=PaginatedFavoritesResponse)
async def get_my_favorites(
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip 不能为负数")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1-100 之间")

    count_stmt = select(func.count(Favorite.id)).where(
        Favorite.user_id == current_user.id
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

    stmt = (
        select(Favorite, Post, Section, func.coalesce(reply_count_subq.c.rc_count, 0).label("reply_count"), User)
        .join(Post, Favorite.post_id == Post.id)
        .join(User, Post.author_id == User.id, isouter=True)
        .join(Section, Post.section_id == Section.id, isouter=True)
        .join(reply_count_subq, Post.id == reply_count_subq.c.rc_post_id, isouter=True)
        .where(
            Favorite.user_id == current_user.id,
            Post.is_deleted == False,
        )
        .options(
            contains_eager(Post.author, alias=User),
            contains_eager(Post.section, alias=Section),
        )
        .order_by(Favorite.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.unique().all()

    items = []
    for favorite, post, section, reply_count, _author in rows:
        items.append(
            FavoritePostItem(
                id=post.id,
                title=post.title,
                section_id=post.section_id,
                author_id=post.author_id,
                author=AuthorBrief(
                    id=post.author.id,
                    username=post.author.username,
                    avatar=post.author.avatar,
                ),
                section=SectionBrief(
                    id=section.id if section else post.section_id,
                    name=section.name if section else "未知板块",
                ),
                is_pinned=post.is_pinned,
                view_count=post.view_count,
                reply_count=reply_count,
                created_at=post.created_at,
                favorited_at=favorite.created_at,
            )
        )

    return PaginatedFavoritesResponse(items=items, total=total, skip=skip, limit=limit)
