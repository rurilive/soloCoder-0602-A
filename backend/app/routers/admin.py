from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin_user
from app.database import get_db
from app.models import Moderator, Post, User
from app.schemas import MuteUpdate, ModeratorCreate, ModeratorResponse, ReputationAdjust, UserResponse
from app.services.reputation import change_reputation

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/moderators", response_model=ModeratorResponse, status_code=201)
async def create_moderator(
    mod_data: ModeratorCreate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == mod_data.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    result = await db.execute(
        select(Moderator).where(
            Moderator.user_id == mod_data.user_id,
            Moderator.section_id == mod_data.section_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该用户已是此板块的版主")

    mod = Moderator(user_id=mod_data.user_id, section_id=mod_data.section_id)
    db.add(mod)
    await db.commit()
    await db.refresh(mod)

    result = await db.execute(
        select(Moderator).where(Moderator.id == mod.id)
    )
    mod = result.scalar_one()

    user_result = await db.execute(select(User).where(User.id == mod.user_id))
    user = user_result.scalar_one()

    from app.schemas import AuthorBrief

    return ModeratorResponse(
        id=mod.id,
        user_id=mod.user_id,
        section_id=mod.section_id,
        user=AuthorBrief(id=user.id, username=user.username, avatar=user.avatar),
    )


@router.delete("/moderators/{mod_id}")
async def delete_moderator(
    mod_id: int,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Moderator).where(Moderator.id == mod_id))
    mod = result.scalar_one_or_none()
    if not mod:
        raise HTTPException(status_code=404, detail="版主记录不存在")

    await db.delete(mod)
    await db.commit()
    return {"message": "版主已移除"}


@router.put("/users/{user_id}/mute", response_model=UserResponse)
async def mute_user(
    user_id: int,
    mute_data: MuteUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if mute_data.is_muted and not user.is_muted:
        await change_reputation(
            db,
            user_id=user_id,
            change=-30,
            reason="被管理员禁言",
            reason_type="muted",
            operator_id=admin.id,
        )

    user.is_muted = mute_data.is_muted
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/users/{user_id}/reputation", response_model=UserResponse)
async def adjust_reputation(
    user_id: int,
    adj_data: ReputationAdjust,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if adj_data.change == 0:
        raise HTTPException(status_code=400, detail="声望变化值不能为 0")

    await change_reputation(
        db,
        user_id=user_id,
        change=adj_data.change,
        reason=adj_data.reason or "管理员手动调整",
        reason_type="manual_adjust",
        operator_id=admin.id,
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/posts/{post_id}")
async def force_delete_post(
    post_id: int,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    await db.delete(post)
    await db.commit()
    return {"message": "帖子已永久删除"}
