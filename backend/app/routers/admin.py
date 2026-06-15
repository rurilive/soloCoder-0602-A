from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin_user
from app.database import get_db
from app.models import Moderator, Post, SensitiveWord, User
from app.schemas import (
    MuteUpdate,
    ModeratorCreate,
    ModeratorResponse,
    PaginatedSensitiveWordsResponse,
    ReputationAdjust,
    SensitiveWordCreate,
    SensitiveWordResponse,
    SensitiveWordUpdate,
    UserResponse,
)
from app.services.reputation import RESTRICTED_THRESHOLD, change_reputation
from app.utils.sensitive_words import load_sensitive_words_from_db

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
        user=AuthorBrief(id=user.id, username=user.username, avatar=user.avatar, reputation=user.reputation),
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

    if not mute_data.is_muted and user.is_muted:
        if user.reputation < RESTRICTED_THRESHOLD:
            change_amount = RESTRICTED_THRESHOLD - user.reputation
            await change_reputation(
                db,
                user_id=user_id,
                change=change_amount,
                reason="管理员解禁，恢复声望至受限阈值",
                reason_type="unmute_restore",
                operator_id=admin.id,
                user_obj=user,
            )
        elif user.role == "restricted":
            user.role = "user"

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


@router.get("/sensitive-words", response_model=PaginatedSensitiveWordsResponse)
async def list_sensitive_words(
    skip: int = 0,
    limit: int = 50,
    keyword: str | None = None,
    category: str | None = None,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    where_conditions = []
    if keyword:
        where_conditions.append(SensitiveWord.word.ilike(f"%{keyword}%"))
    if category:
        where_conditions.append(SensitiveWord.category == category)

    count_result = await db.execute(
        select(func.count(SensitiveWord.id)).where(*where_conditions)
    )
    total = count_result.scalar() or 0

    stmt = (
        select(SensitiveWord)
        .where(*where_conditions)
        .order_by(SensitiveWord.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    words = result.scalars().all()

    return PaginatedSensitiveWordsResponse(
        items=[SensitiveWordResponse.model_validate(w) for w in words],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("/sensitive-words", response_model=SensitiveWordResponse, status_code=201)
async def create_sensitive_word(
    word_data: SensitiveWordCreate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(SensitiveWord).where(SensitiveWord.word == word_data.word)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该敏感词已存在")

    word = SensitiveWord(
        word=word_data.word,
        category=word_data.category or "general",
    )
    db.add(word)
    await db.commit()
    await db.refresh(word)

    await load_sensitive_words_from_db(db)

    return SensitiveWordResponse.model_validate(word)


@router.put("/sensitive-words/{word_id}", response_model=SensitiveWordResponse)
async def update_sensitive_word(
    word_id: int,
    word_data: SensitiveWordUpdate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SensitiveWord).where(SensitiveWord.id == word_id))
    word = result.scalar_one_or_none()
    if not word:
        raise HTTPException(status_code=404, detail="敏感词不存在")

    if word_data.word is not None and word_data.word != word.word:
        existing = await db.execute(
            select(SensitiveWord).where(SensitiveWord.word == word_data.word)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="该敏感词已存在")
        word.word = word_data.word

    if word_data.category is not None:
        word.category = word_data.category

    await db.commit()
    await db.refresh(word)

    await load_sensitive_words_from_db(db)

    return SensitiveWordResponse.model_validate(word)


@router.delete("/sensitive-words/{word_id}")
async def delete_sensitive_word(
    word_id: int,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SensitiveWord).where(SensitiveWord.id == word_id))
    word = result.scalar_one_or_none()
    if not word:
        raise HTTPException(status_code=404, detail="敏感词不存在")

    await db.delete(word)
    await db.commit()

    await load_sensitive_words_from_db(db)

    return {"message": "敏感词已删除"}
