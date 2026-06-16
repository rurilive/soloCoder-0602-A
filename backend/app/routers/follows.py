import base64
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, union_all, literal_column
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Favorite, Follow, Post, Reply, Reward, Section, User
from app.schemas import (
    AuthorBrief,
    FeedPostItem,
    FeedReplyItem,
    FeedResponse,
    FollowListResponse,
    FollowUserItem,
    SectionBrief,
)

router = APIRouter(prefix="/api", tags=["follows"])


@router.post("/users/{user_id}/follow")
async def follow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能关注自己")

    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")

    result = await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.followee_id == user_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="已关注该用户")

    follow = Follow(follower_id=current_user.id, followee_id=user_id)
    db.add(follow)
    await db.commit()
    return {"message": "关注成功", "following": True}


@router.delete("/users/{user_id}/follow")
async def unfollow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.followee_id == user_id,
        )
    )
    follow = result.scalar_one_or_none()
    if not follow:
        raise HTTPException(status_code=400, detail="未关注该用户")

    await db.delete(follow)
    await db.commit()
    return {"message": "取消关注成功", "following": False}


@router.get("/users/{user_id}/following", response_model=FollowListResponse)
async def get_following(
    user_id: int,
    skip: int = 0,
    limit: int = 20,
    current_user: User | None = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip 不能为负数")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1-100 之间")

    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="用户不存在")

    count_stmt = select(func.count(Follow.id)).where(Follow.follower_id == user_id)
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        select(Follow)
        .where(Follow.follower_id == user_id)
        .order_by(Follow.created_at.desc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(Follow.followee))
    )
    follows = (await db.execute(stmt)).scalars().all()

    my_following_ids = set()
    if current_user:
        my_result = await db.execute(
            select(Follow.followee_id).where(Follow.follower_id == current_user.id)
        )
        my_following_ids = set(my_result.scalars().all())

    items = []
    for f in follows:
        u = f.followee
        items.append(
            FollowUserItem(
                id=u.id,
                username=u.username,
                avatar=u.avatar,
                reputation=u.reputation,
                is_following=(current_user is not None and u.id in my_following_ids),
            )
        )

    return FollowListResponse(items=items, total=total)


@router.get("/users/{user_id}/followers", response_model=FollowListResponse)
async def get_followers(
    user_id: int,
    skip: int = 0,
    limit: int = 20,
    current_user: User | None = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip 不能为负数")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1-100 之间")

    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="用户不存在")

    count_stmt = select(func.count(Follow.id)).where(Follow.followee_id == user_id)
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        select(Follow)
        .where(Follow.followee_id == user_id)
        .order_by(Follow.created_at.desc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(Follow.follower))
    )
    follows = (await db.execute(stmt)).scalars().all()

    my_following_ids = set()
    if current_user:
        my_result = await db.execute(
            select(Follow.followee_id).where(Follow.follower_id == current_user.id)
        )
        my_following_ids = set(my_result.scalars().all())

    items = []
    for f in follows:
        u = f.follower
        items.append(
            FollowUserItem(
                id=u.id,
                username=u.username,
                avatar=u.avatar,
                reputation=u.reputation,
                is_following=(current_user is not None and u.id in my_following_ids),
            )
        )

    return FollowListResponse(items=items, total=total)


@router.get("/users/{user_id}/is-following")
async def check_following(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.followee_id == user_id,
        )
    )
    return {"is_following": result.scalar_one_or_none() is not None}


def _encode_cursor(created_at: datetime, item_id: int, activity_type: str) -> str:
    raw = f"{activity_type}|{created_at.isoformat()}|{item_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, int, str] | None:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        parts = raw.split("|")
        if len(parts) != 3:
            return None
        activity_type = parts[0]
        created_at = datetime.fromisoformat(parts[1])
        item_id = int(parts[2])
        return created_at, item_id, activity_type
    except Exception:
        return None


@router.get("/feed", response_model=FeedResponse)
async def get_feed(
    cursor: str | None = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=400, detail="limit 必须在 1-50 之间")

    followed_result = await db.execute(
        select(Follow.followee_id).where(Follow.follower_id == current_user.id)
    )
    followed_ids = list(followed_result.scalars().all())
    if not followed_ids:
        return FeedResponse(items=[], next_cursor=None, has_more=False)

    reply_count_subq = (
        select(Reply.post_id, func.count(Reply.id).label("rc"))
        .where(Reply.is_deleted == False)
        .group_by(Reply.post_id)
        .subquery()
    )

    fav_count_subq = (
        select(Favorite.post_id, func.count(Favorite.id).label("fc"))
        .group_by(Favorite.post_id)
        .subquery()
    )

    reward_count_subq = (
        select(Reward.post_id, func.count(Reward.id).label("rwc"))
        .group_by(Reward.post_id)
        .subquery()
    )

    fetch_limit = limit + 1

    posts_stmt = (
        select(
            Post.id,
            Post.title,
            Post.content,
            Post.author_id,
            Post.section_id,
            Post.created_at,
            literal_column("0").label("post_id"),
            literal_column("'post'").label("activity_type"),
        )
        .where(
            Post.author_id.in_(followed_ids),
            Post.is_deleted == False,
            Post.is_hidden == False,
            Post.is_pending_review == False,
        )
    )

    replies_stmt = (
        select(
            Reply.id,
            Post.title,
            Reply.content,
            Reply.author_id,
            Post.section_id,
            Reply.created_at,
            Reply.post_id,
            literal_column("'reply'").label("activity_type"),
        )
        .join(Post, Reply.post_id == Post.id)
        .where(
            Reply.author_id.in_(followed_ids),
            Reply.is_deleted == False,
            Reply.is_hidden == False,
            Reply.is_pending_review == False,
            Post.is_deleted == False,
        )
    )

    if cursor:
        decoded = _decode_cursor(cursor)
        if decoded:
            cursor_time, cursor_id, cursor_type = decoded
            posts_stmt = posts_stmt.where(
                (Post.created_at < cursor_time)
                | ((Post.created_at == cursor_time) & (Post.id < cursor_id))
            )
            replies_stmt = replies_stmt.where(
                (Reply.created_at < cursor_time)
                | ((Reply.created_at == cursor_time) & (Reply.id < cursor_id))
            )

    combined = union_all(posts_stmt, replies_stmt).order_by(
        literal_column("created_at").desc(),
        literal_column("id").desc(),
    ).limit(fetch_limit)

    result = await db.execute(combined)
    rows = result.all()

    has_more = len(rows) > limit
    rows = rows[:limit]

    if not rows:
        return FeedResponse(items=[], next_cursor=None, has_more=False)

    author_ids = {r.author_id for r in rows}
    section_ids = {r.section_id for r in rows}

    original_post_ids = {r.post_id for r in rows if r.activity_type == "reply"}

    authors_result = await db.execute(
        select(User).where(User.id.in_(author_ids))
    )
    authors_map = {u.id: u for u in authors_result.scalars().all()}

    sections_result = await db.execute(
        select(Section).where(Section.id.in_(section_ids))
    )
    sections_map = {s.id: s for s in sections_result.scalars().all()}

    all_post_ids = {r.id for r in rows if r.activity_type == "post"}
    all_post_ids.update(original_post_ids)

    reply_counts_map = {}
    if all_post_ids:
        rc_result = await db.execute(
            select(
                reply_count_subq.c.post_id,
                reply_count_subq.c.rc,
            ).where(reply_count_subq.c.post_id.in_(all_post_ids))
        )
        for pid, rc in rc_result.all():
            reply_counts_map[pid] = rc

    fav_counts_map = {}
    if all_post_ids:
        fc_result = await db.execute(
            select(
                fav_count_subq.c.post_id,
                fav_count_subq.c.fc,
            ).where(fav_count_subq.c.post_id.in_(all_post_ids))
        )
        for pid, fc in fc_result.all():
            fav_counts_map[pid] = fc

    reward_counts_map = {}
    if all_post_ids:
        rwc_result = await db.execute(
            select(
                reward_count_subq.c.post_id,
                reward_count_subq.c.rwc,
            ).where(reward_count_subq.c.post_id.in_(all_post_ids))
        )
        for pid, rwc in rwc_result.all():
            reward_counts_map[pid] = rwc

    original_posts_map = {}
    if original_post_ids:
        op_result = await db.execute(
            select(Post.id, Post.title).where(Post.id.in_(original_post_ids))
        )
        for pid, ptitle in op_result.all():
            original_posts_map[pid] = ptitle

    items = []
    last_cursor = None
    for r in rows:
        author = authors_map.get(r.author_id)
        section = sections_map.get(r.section_id)
        if not author or not section:
            continue

        author_brief = AuthorBrief(
            id=author.id,
            username=author.username,
            avatar=author.avatar,
            reputation=author.reputation,
        )
        section_brief = SectionBrief(id=section.id, name=section.name)
        cur = _encode_cursor(r.created_at, r.id, r.activity_type)

        summary = r.content[:120] + ("..." if len(r.content) > 120 else "")

        if r.activity_type == "post":
            item = FeedPostItem(
                activity_type="post",
                id=r.id,
                title=r.title,
                content_summary=summary,
                author=author_brief,
                section=section_brief,
                reply_count=reply_counts_map.get(r.id, 0),
                favorite_count=fav_counts_map.get(r.id, 0),
                reward_count=reward_counts_map.get(r.id, 0),
                created_at=r.created_at,
                cursor=cur,
            )
        else:
            orig_title = original_posts_map.get(r.post_id, "未知帖子")
            item = FeedReplyItem(
                activity_type="reply",
                id=r.id,
                content_summary=summary,
                author=author_brief,
                section=section_brief,
                reply_count=reply_counts_map.get(r.post_id, 0),
                favorite_count=fav_counts_map.get(r.post_id, 0),
                reward_count=reward_counts_map.get(r.post_id, 0),
                created_at=r.created_at,
                cursor=cur,
                original_post_id=r.post_id,
                original_post_title=orig_title,
            )
        items.append(item)
        last_cursor = cur

    return FeedResponse(
        items=items,
        next_cursor=last_cursor if has_more else None,
        has_more=has_more,
    )
