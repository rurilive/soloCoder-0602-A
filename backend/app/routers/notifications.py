from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Notification, User
from app.schemas import (
    AuthorBrief,
    NotificationResponse,
    PaginatedNotificationsResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=PaginatedNotificationsResponse)
async def list_notifications(
    skip: int = 0,
    limit: int = 20,
    only_unread: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip 不能为负数")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1-100 之间")

    base_where = [Notification.user_id == current_user.id]
    if only_unread:
        base_where.append(Notification.is_read == False)

    count_stmt = select(func.count(Notification.id)).where(*base_where)
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    stmt = (
        select(Notification)
        .where(*base_where)
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(Notification.actor))
    )
    result = await db.execute(stmt)
    notifications = result.scalars().all()

    items = []
    for n in notifications:
        actor = None
        if n.actor:
            actor = AuthorBrief(
                id=n.actor.id,
                username=n.actor.username,
                avatar=n.actor.avatar,
            )
        items.append(
            NotificationResponse(
                id=n.id,
                type=n.type,
                content=n.content,
                post_id=n.post_id,
                reply_id=n.reply_id,
                actor=actor,
                is_read=n.is_read,
                created_at=n.created_at,
            )
        )

    return PaginatedNotificationsResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(func.count(Notification.id)).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    )
    result = await db.execute(stmt)
    count = result.scalar() or 0
    return UnreadCountResponse(count=count)


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id)
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="通知不存在")
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权操作此通知")

    notification.is_read = True
    await db.commit()
    return {"message": "已标记为已读"}


@router.post("/read-all")
async def mark_all_as_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update

    stmt = (
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
        .values(is_read=True)
    )
    await db.execute(stmt)
    await db.commit()
    return {"message": "全部标记为已读"}
