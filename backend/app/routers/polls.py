from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user, get_optional_current_user
from app.database import get_db
from app.models import Poll, PollOption, PollVote, Post, User
from app.schemas import PollCreate, PollOptionResponse, PollResponse, PollVoteCreate

router = APIRouter(prefix="/api", tags=["polls"])


async def _build_poll_response(db: AsyncSession, poll: Poll, current_user: User | None = None) -> PollResponse:
    total_votes_result = await db.execute(
        select(func.count(PollVote.id)).where(PollVote.poll_id == poll.id)
    )
    total_votes = total_votes_result.scalar() or 0

    has_voted = False
    voted_option_ids: list[int] = []
    if current_user:
        user_votes_result = await db.execute(
            select(PollVote.option_id).where(
                PollVote.poll_id == poll.id,
                PollVote.user_id == current_user.id,
            )
        )
        voted_rows = user_votes_result.all()
        voted_option_ids = [row[0] for row in voted_rows]
        has_voted = len(voted_option_ids) > 0

    options = []
    for opt in poll.options:
        percentage = (opt.vote_count / total_votes * 100) if total_votes > 0 else 0.0
        options.append(
            PollOptionResponse(
                id=opt.id,
                content=opt.content,
                vote_count=opt.vote_count,
                percentage=round(percentage, 1),
            )
        )

    return PollResponse(
        id=poll.id,
        post_id=poll.post_id,
        is_multi=poll.is_multi,
        max_choices=poll.max_choices,
        total_votes=total_votes,
        has_voted=has_voted,
        voted_option_ids=voted_option_ids,
        options=options,
        created_at=poll.created_at,
    )


@router.post("/posts/{post_id}/poll", response_model=PollResponse, status_code=201)
async def create_poll(
    post_id: int,
    poll_data: PollCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id, Post.is_deleted == False))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="只有帖子作者可以创建投票")

    existing = await db.execute(select(Poll).where(Poll.post_id == post_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该帖子已有投票")

    if len(poll_data.options) < 2:
        raise HTTPException(status_code=400, detail="投票至少需要2个选项")

    if len(poll_data.options) > 20:
        raise HTTPException(status_code=400, detail="投票选项不能超过20个")

    if poll_data.is_multi:
        if poll_data.max_choices < 2:
            raise HTTPException(status_code=400, detail="多选投票最多可选数至少为2")
        if poll_data.max_choices > len(poll_data.options):
            raise HTTPException(status_code=400, detail="最多可选数不能超过选项总数")

    for opt_text in poll_data.options:
        if not opt_text.strip():
            raise HTTPException(status_code=400, detail="选项内容不能为空")
        if len(opt_text) > 200:
            raise HTTPException(status_code=400, detail="选项内容不能超过200个字符")

    poll = Poll(
        post_id=post_id,
        is_multi=poll_data.is_multi,
        max_choices=poll_data.max_choices if poll_data.is_multi else 1,
    )
    db.add(poll)
    await db.flush()

    for opt_text in poll_data.options:
        option = PollOption(poll_id=poll.id, content=opt_text.strip())
        db.add(option)

    await db.commit()

    result = await db.execute(
        select(Poll).where(Poll.id == poll.id).options(
            selectinload(Poll.options),
        )
    )
    poll = result.scalar_one()

    return await _build_poll_response(db, poll, current_user)


@router.get("/posts/{post_id}/poll", response_model=PollResponse)
async def get_poll(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    result = await db.execute(
        select(Poll).where(Poll.post_id == post_id).options(
            selectinload(Poll.options),
        )
    )
    poll = result.scalar_one_or_none()
    if not poll:
        raise HTTPException(status_code=404, detail="该帖子没有投票")

    return await _build_poll_response(db, poll, current_user)


@router.post("/posts/{post_id}/poll/vote", response_model=PollResponse)
async def vote_poll(
    post_id: int,
    vote_data: PollVoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Poll).where(Poll.post_id == post_id).options(
            selectinload(Poll.options),
        )
    )
    poll = result.scalar_one_or_none()
    if not poll:
        raise HTTPException(status_code=404, detail="该帖子没有投票")

    existing_vote = await db.execute(
        select(PollVote).where(
            PollVote.poll_id == poll.id,
            PollVote.user_id == current_user.id,
        )
    )
    if existing_vote.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="您已经投过票了，不可更改")

    if not vote_data.option_ids:
        raise HTTPException(status_code=400, detail="请选择至少一个选项")

    if not poll.is_multi and len(vote_data.option_ids) > 1:
        raise HTTPException(status_code=400, detail="单选投票只能选择一个选项")

    if poll.is_multi and len(vote_data.option_ids) > poll.max_choices:
        raise HTTPException(status_code=400, detail=f"最多只能选择{poll.max_choices}个选项")

    valid_option_ids = {opt.id for opt in poll.options}
    for oid in vote_data.option_ids:
        if oid not in valid_option_ids:
            raise HTTPException(status_code=400, detail=f"选项 {oid} 不存在")

    for oid in vote_data.option_ids:
        vote = PollVote(
            poll_id=poll.id,
            option_id=oid,
            user_id=current_user.id,
        )
        db.add(vote)

        option_result = await db.execute(select(PollOption).where(PollOption.id == oid))
        option = option_result.scalar_one()
        option.vote_count += 1

    await db.commit()

    result = await db.execute(
        select(Poll).where(Poll.id == poll.id).options(
            selectinload(Poll.options),
        )
    )
    poll = result.scalar_one()

    return await _build_poll_response(db, poll, current_user)
