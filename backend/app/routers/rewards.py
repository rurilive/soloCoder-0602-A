from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user, get_optional_current_user
from app.database import get_db
from app.models import Post, Reward, User
from app.schemas import (
    AuthorBrief,
    PaginatedRewardsResponse,
    PostRewardInfo,
    RewardResponse,
)
from app.services.reputation import change_reputation

router = APIRouter(prefix="/api", tags=["rewards"])


@router.post("/posts/{post_id}/reward")
async def reward_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.reputation < 2:
        raise HTTPException(status_code=400, detail="声望不足，打赏需要2点声望")

    result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    if post.author_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能打赏自己的帖子")

    reward = Reward(
        giver_id=current_user.id,
        receiver_id=post.author_id,
        post_id=post_id,
        amount=2,
    )
    db.add(reward)

    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="您已打赏过该帖子")

    await change_reputation(
        db,
        user_id=current_user.id,
        change=-2,
        reason=f"打赏帖子《{post.title}》",
        reason_type="reward_given",
        operator_id=current_user.id,
        post_id=post_id,
    )

    await change_reputation(
        db,
        user_id=post.author_id,
        change=1,
        reason=f"帖子《{post.title}》被 {current_user.username} 打赏",
        reason_type="reward_received",
        operator_id=current_user.id,
        post_id=post_id,
    )

    await db.commit()

    return {"message": "打赏成功", "amount": 2}


@router.get("/posts/{post_id}/reward-info", response_model=PostRewardInfo)
async def get_post_reward_info(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="帖子不存在")

    count_result = await db.execute(
        select(func.count(Reward.id)).where(Reward.post_id == post_id)
    )
    reward_count = count_result.scalar() or 0

    is_rewarded = False
    if current_user is not None:
        existing = await db.execute(
            select(Reward).where(
                Reward.giver_id == current_user.id,
                Reward.post_id == post_id,
            )
        )
        is_rewarded = existing.scalar_one_or_none() is not None

    rewarders_result = await db.execute(
        select(Reward)
        .where(Reward.post_id == post_id)
        .order_by(Reward.created_at.desc())
        .limit(10)
        .options(selectinload(Reward.giver))
    )
    rewards = rewarders_result.scalars().all()

    rewarders = []
    for r in rewards:
        rewarders.append(
            AuthorBrief(
                id=r.giver.id,
                username=r.giver.username,
                avatar=r.giver.avatar,
                reputation=r.giver.reputation,
            )
        )

    return PostRewardInfo(
        reward_count=reward_count,
        is_rewarded=is_rewarded,
        rewarders=rewarders,
    )


@router.get("/me/rewards/given", response_model=PaginatedRewardsResponse)
async def get_my_given_rewards(
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip 不能为负数")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1-100 之间")

    count_result = await db.execute(
        select(func.count(Reward.id)).where(Reward.giver_id == current_user.id)
    )
    total = count_result.scalar() or 0

    stmt = (
        select(Reward)
        .where(Reward.giver_id == current_user.id)
        .order_by(Reward.created_at.desc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(Reward.giver), selectinload(Reward.receiver), selectinload(Reward.post))
    )
    result = await db.execute(stmt)
    rewards = result.scalars().all()

    items = []
    for r in rewards:
        items.append(
            RewardResponse(
                id=r.id,
                giver_id=r.giver_id,
                receiver_id=r.receiver_id,
                post_id=r.post_id,
                amount=r.amount,
                giver=AuthorBrief(
                    id=r.giver.id,
                    username=r.giver.username,
                    avatar=r.giver.avatar,
                    reputation=r.giver.reputation,
                ),
                receiver=AuthorBrief(
                    id=r.receiver.id,
                    username=r.receiver.username,
                    avatar=r.receiver.avatar,
                    reputation=r.receiver.reputation,
                ),
                post_title=r.post.title if r.post else None,
                created_at=r.created_at,
            )
        )

    return PaginatedRewardsResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/me/rewards/received", response_model=PaginatedRewardsResponse)
async def get_my_received_rewards(
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip 不能为负数")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1-100 之间")

    count_result = await db.execute(
        select(func.count(Reward.id)).where(Reward.receiver_id == current_user.id)
    )
    total = count_result.scalar() or 0

    stmt = (
        select(Reward)
        .where(Reward.receiver_id == current_user.id)
        .order_by(Reward.created_at.desc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(Reward.giver), selectinload(Reward.receiver), selectinload(Reward.post))
    )
    result = await db.execute(stmt)
    rewards = result.scalars().all()

    items = []
    for r in rewards:
        items.append(
            RewardResponse(
                id=r.id,
                giver_id=r.giver_id,
                receiver_id=r.receiver_id,
                post_id=r.post_id,
                amount=r.amount,
                giver=AuthorBrief(
                    id=r.giver.id,
                    username=r.giver.username,
                    avatar=r.giver.avatar,
                    reputation=r.giver.reputation,
                ),
                receiver=AuthorBrief(
                    id=r.receiver.id,
                    username=r.receiver.username,
                    avatar=r.receiver.avatar,
                    reputation=r.receiver.reputation,
                ),
                post_title=r.post.title if r.post else None,
                created_at=r.created_at,
            )
        )

    return PaginatedRewardsResponse(items=items, total=total, skip=skip, limit=limit)
