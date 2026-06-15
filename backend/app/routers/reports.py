from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user, is_moderator
from app.database import get_db
from app.models import Notification, Post, Reply, Report, Section, User
from app.schemas import (
    AuthorBrief,
    PaginatedPendingReviewsResponse,
    PaginatedReportsResponse,
    PendingReviewItem,
    ReportBatchAction,
    ReportCreate,
    ReportResponse,
)
from app.services.reputation import change_reputation

router = APIRouter(prefix="/api/reports", tags=["reports"])

AUTO_HIDE_THRESHOLD = 3
SENSITIVE_HIT_REPORT_THRESHOLD = 3


async def auto_report_for_sensitive(
    db: AsyncSession, user_id: int, target_type: str, target_id: int, hit_words: list[str]
) -> None:
    from sqlalchemy import and_, func, or_

    pending_count = 0
    post_result = await db.execute(
        select(func.count(Post.id)).where(
            Post.author_id == user_id,
            Post.is_deleted == False,
            Post.is_pending_review == True,
        )
    )
    pending_count += post_result.scalar() or 0

    reply_result = await db.execute(
        select(func.count(Reply.id)).where(
            Reply.author_id == user_id,
            Reply.is_deleted == False,
            Reply.is_pending_review == True,
        )
    )
    pending_count += reply_result.scalar() or 0

    if pending_count < SENSITIVE_HIT_REPORT_THRESHOLD:
        return

    admin_result = await db.execute(
        select(User).where(User.role == "admin").limit(1)
    )
    admin = admin_result.scalar_one_or_none()
    if not admin:
        return

    existing = await db.execute(
        select(Report).where(
            Report.reporter_id == admin.id,
            Report.target_type == target_type,
            Report.target_id == target_id,
            Report.report_type == "auto_sensitive",
        )
    )
    if existing.scalar_one_or_none():
        return

    reason = f"自动检测到敏感词：{', '.join(hit_words)}（用户累计{pending_count}次命中敏感词）"
    report = Report(
        reporter_id=admin.id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        report_type="auto_sensitive",
    )
    db.add(report)
    await db.commit()


async def _auto_hide_if_needed(
    db: AsyncSession, target_type: str, target_id: int
) -> None:
    count_result = await db.execute(
        select(func.count(Report.id)).where(
            Report.target_type == target_type,
            Report.target_id == target_id,
            Report.status == "pending",
        )
    )
    pending_count = count_result.scalar() or 0

    if pending_count < AUTO_HIDE_THRESHOLD:
        return

    if target_type == "post":
        result = await db.execute(select(Post).where(Post.id == target_id))
        post = result.scalar_one_or_none()
        if post and not post.is_hidden:
            post.is_hidden = True
    elif target_type == "reply":
        result = await db.execute(select(Reply).where(Reply.id == target_id))
        reply = result.scalar_one_or_none()
        if reply and not reply.is_hidden:
            reply.is_hidden = True


def _build_report_response(report: Report) -> ReportResponse:
    reporter = AuthorBrief(
        id=report.reporter.id,
        username=report.reporter.username,
        avatar=report.reporter.avatar,
        reputation=report.reporter.reputation,
    )
    reviewer = None
    if report.reviewer:
        reviewer = AuthorBrief(
            id=report.reviewer.id,
            username=report.reviewer.username,
            avatar=report.reviewer.avatar,
            reputation=report.reviewer.reputation,
        )
    return ReportResponse(
        id=report.id,
        reporter_id=report.reporter_id,
        reporter=reporter,
        target_type=report.target_type,
        target_id=report.target_id,
        reason=report.reason,
        status=report.status,
        reviewer_id=report.reviewer_id,
        reviewer=reviewer,
        review_note=report.review_note,
        created_at=report.created_at,
        reviewed_at=report.reviewed_at,
    )


async def _enrich_report(
    db: AsyncSession, report: Report, resp: ReportResponse
) -> ReportResponse:
    if report.target_type == "post":
        result = await db.execute(
            select(Post)
            .where(Post.id == report.target_id)
            .options(selectinload(Post.author), selectinload(Post.section))
        )
        post = result.scalar_one_or_none()
        if post:
            resp.target_content = post.title
            resp.target_author = AuthorBrief(
                id=post.author.id,
                username=post.author.username,
                avatar=post.author.avatar,
                reputation=post.author.reputation,
            )
            resp.target_section_id = post.section_id
            resp.target_section_name = post.section.name if post.section else None
    elif report.target_type == "reply":
        result = await db.execute(
            select(Reply)
            .where(Reply.id == report.target_id)
            .options(selectinload(Reply.author), selectinload(Reply.post).selectinload(Post.section))
        )
        reply = result.scalar_one_or_none()
        if reply:
            content_preview = reply.content[:100] + ("..." if len(reply.content) > 100 else "")
            resp.target_content = content_preview
            resp.target_author = AuthorBrief(
                id=reply.author.id,
                username=reply.author.username,
                avatar=reply.author.avatar,
                reputation=reply.author.reputation,
            )
            if reply.post:
                resp.target_section_id = reply.post.section_id
                resp.target_section_name = reply.post.section.name if reply.post.section else None
    return resp


async def _notify_reporters(
    db: AsyncSession,
    report_ids: list[int],
    action: str,
    review_note: str | None,
) -> None:
    result = await db.execute(
        select(Report)
        .where(Report.id.in_(report_ids))
        .options(selectinload(Report.reporter))
    )
    reports = result.scalars().all()

    notifications = []
    for report in reports:
        action_text = "已通过（内容被隐藏）" if action == "resolve" else "已驳回（内容恢复显示）"
        content = f"你对{'帖子' if report.target_type == 'post' else '回复'}的举报{action_text}"
        if review_note:
            content += f"，审核意见：{review_note}"
        notifications.append(
            Notification(
                user_id=report.reporter_id,
                type="report_result",
                content=content,
                post_id=report.target_id if report.target_type == "post" else None,
                reply_id=report.target_id if report.target_type == "reply" else None,
            )
        )

    if notifications:
        db.add_all(notifications)
        await db.commit()


@router.post("", response_model=ReportResponse, status_code=201)
async def create_report(
    report_data: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if report_data.target_type not in ("post", "reply"):
        raise HTTPException(status_code=400, detail="举报目标类型无效")

    if report_data.target_type == "post":
        result = await db.execute(
            select(Post).where(Post.id == report_data.target_id)
        )
        target = result.scalar_one_or_none()
        if not target:
            raise HTTPException(status_code=404, detail="帖子不存在")
        if target.author_id == current_user.id:
            raise HTTPException(status_code=400, detail="不能举报自己的帖子")
    else:
        result = await db.execute(
            select(Reply).where(Reply.id == report_data.target_id)
        )
        target = result.scalar_one_or_none()
        if not target:
            raise HTTPException(status_code=404, detail="回复不存在")
        if target.author_id == current_user.id:
            raise HTTPException(status_code=400, detail="不能举报自己的回复")

    existing = await db.execute(
        select(Report).where(
            Report.reporter_id == current_user.id,
            Report.target_type == report_data.target_type,
            Report.target_id == report_data.target_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="你已经举报过此内容")

    report = Report(
        reporter_id=current_user.id,
        target_type=report_data.target_type,
        target_id=report_data.target_id,
        reason=report_data.reason,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    await _auto_hide_if_needed(db, report.target_type, report.target_id)
    await db.commit()

    result = await db.execute(
        select(Report).where(Report.id == report.id).options(
            selectinload(Report.reporter),
            selectinload(Report.reviewer),
        )
    )
    report = result.scalar_one()
    resp = _build_report_response(report)
    resp = await _enrich_report(db, report, resp)
    return resp


@router.get("/pending", response_model=PaginatedReportsResponse)
async def list_pending_reports(
    skip: int = 0,
    limit: int = 20,
    section_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_moderator(db, current_user):
        raise HTTPException(status_code=403, detail="需要管理员或版主权限")

    base_where = [Report.status == "pending"]

    if section_id is not None:
        post_ids_stmt = select(Post.id).where(Post.section_id == section_id)
        post_ids_result = await db.execute(post_ids_stmt)
        post_ids = [row[0] for row in post_ids_result.all()]

        reply_ids_stmt = select(Reply.id).where(Reply.post_id.in_(post_ids))
        reply_ids_result = await db.execute(reply_ids_stmt)
        reply_ids = [row[0] for row in reply_ids_result.all()]

        if not post_ids and not reply_ids:
            return PaginatedReportsResponse(items=[], total=0, skip=skip, limit=limit)

        from sqlalchemy import or_
        base_where.append(
            or_(
                (Report.target_type == "post") & (Report.target_id.in_(post_ids)),
                (Report.target_type == "reply") & (Report.target_id.in_(reply_ids)),
            )
        )

    count_result = await db.execute(
        select(func.count(Report.id)).where(*base_where)
    )
    total = count_result.scalar() or 0

    stmt = (
        select(Report)
        .where(*base_where)
        .order_by(Report.created_at.desc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(Report.reporter), selectinload(Report.reviewer))
    )
    result = await db.execute(stmt)
    reports = result.scalars().all()

    items = []
    for report in reports:
        resp = _build_report_response(report)
        resp = await _enrich_report(db, report, resp)
        items.append(resp)

    return PaginatedReportsResponse(items=items, total=total, skip=skip, limit=limit)


async def _process_review(
    db: AsyncSession,
    report: Report,
    action: str,
    reviewer: User,
    review_note: str | None,
) -> None:
    report.status = "resolved" if action == "resolve" else "dismissed"
    report.reviewer_id = reviewer.id
    report.review_note = review_note
    report.reviewed_at = datetime.utcnow()

    if action == "resolve":
        if report.target_type == "post":
            result = await db.execute(select(Post).where(Post.id == report.target_id).options(selectinload(Post.author)))
            post = result.scalar_one_or_none()
            if post:
                post.is_hidden = True
                if post.author_id != reviewer.id:
                    await change_reputation(
                        db,
                        user_id=post.author_id,
                        change=-15,
                        reason=f"你发布的帖子《{post.title}》因违规被举报通过",
                        reason_type="report_resolved",
                        operator_id=reviewer.id,
                        post_id=post.id,
                    )
        elif report.target_type == "reply":
            result = await db.execute(select(Reply).where(Reply.id == report.target_id).options(selectinload(Reply.author)))
            reply = result.scalar_one_or_none()
            if reply:
                reply.is_hidden = True
                if reply.author_id != reviewer.id:
                    content_preview = reply.content[:50] + ("..." if len(reply.content) > 50 else "")
                    await change_reputation(
                        db,
                        user_id=reply.author_id,
                        change=-15,
                        reason=f"你发布的回复《{content_preview}》因违规被举报通过",
                        reason_type="report_resolved",
                        operator_id=reviewer.id,
                        reply_id=reply.id,
                    )
    elif action == "dismiss":
        await db.flush()
        remaining_pending_result = await db.execute(
            select(func.count(Report.id)).where(
                Report.target_type == report.target_type,
                Report.target_id == report.target_id,
                Report.status == "pending",
            )
        )
        remaining_pending = remaining_pending_result.scalar() or 0
        resolved_result = await db.execute(
            select(func.count(Report.id)).where(
                Report.target_type == report.target_type,
                Report.target_id == report.target_id,
                Report.status == "resolved",
            )
        )
        resolved_count = resolved_result.scalar() or 0
        if remaining_pending == 0 and resolved_count == 0:
            if report.target_type == "post":
                result = await db.execute(select(Post).where(Post.id == report.target_id))
                post = result.scalar_one_or_none()
                if post:
                    post.is_hidden = False
            elif report.target_type == "reply":
                result = await db.execute(select(Reply).where(Reply.id == report.target_id))
                reply = result.scalar_one_or_none()
                if reply:
                    reply.is_hidden = False


@router.post("/{report_id}/review", response_model=ReportResponse)
async def review_report(
    report_id: int,
    action: str,
    review_note: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_moderator(db, current_user):
        raise HTTPException(status_code=403, detail="需要管理员或版主权限")

    if action not in ("resolve", "dismiss"):
        raise HTTPException(status_code=400, detail="操作类型无效，需为 resolve 或 dismiss")

    result = await db.execute(
        select(Report)
        .where(Report.id == report_id)
        .options(selectinload(Report.reporter), selectinload(Report.reviewer))
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="举报记录不存在")
    if report.status != "pending":
        raise HTTPException(status_code=400, detail="该举报已处理")

    await _process_review(db, report, action, current_user, review_note)
    await db.commit()

    await _notify_reporters(db, [report_id], action, review_note)

    result = await db.execute(
        select(Report)
        .where(Report.id == report_id)
        .options(selectinload(Report.reporter), selectinload(Report.reviewer))
    )
    report = result.scalar_one()
    resp = _build_report_response(report)
    resp = await _enrich_report(db, report, resp)
    return resp


@router.post("/batch", response_model=dict)
async def batch_review_reports(
    batch_data: ReportBatchAction,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_moderator(db, current_user):
        raise HTTPException(status_code=403, detail="需要管理员或版主权限")

    if batch_data.action not in ("resolve", "dismiss"):
        raise HTTPException(status_code=400, detail="操作类型无效，需为 resolve 或 dismiss")

    if not batch_data.report_ids:
        raise HTTPException(status_code=400, detail="未选择任何举报")

    result = await db.execute(
        select(Report)
        .where(Report.id.in_(batch_data.report_ids), Report.status == "pending")
        .options(selectinload(Report.reporter), selectinload(Report.reviewer))
    )
    reports = result.scalars().all()

    if not reports:
        raise HTTPException(status_code=404, detail="未找到待处理的举报")

    processed_ids = []
    for report in reports:
        await _process_review(db, report, batch_data.action, current_user, batch_data.review_note)
        processed_ids.append(report.id)

    await db.commit()

    await _notify_reporters(db, processed_ids, batch_data.action, batch_data.review_note)

    return {
        "message": f"已处理 {len(processed_ids)} 条举报",
        "processed_count": len(processed_ids),
    }


@router.get("/pending-review", response_model=PaginatedPendingReviewsResponse)
async def list_pending_review_items(
    skip: int = 0,
    limit: int = 20,
    target_type: str | None = None,
    section_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_moderator(db, current_user):
        raise HTTPException(status_code=403, detail="需要管理员或版主权限")

    items = []
    total = 0

    if target_type is None or target_type == "post":
        post_where = [
            Post.is_deleted == False,
            Post.is_pending_review == True,
        ]
        if section_id is not None:
            post_where.append(Post.section_id == section_id)

        post_count_result = await db.execute(
            select(func.count(Post.id)).where(*post_where)
        )
        total += post_count_result.scalar() or 0

    if target_type is None or target_type == "reply":
        reply_where = [
            Reply.is_deleted == False,
            Reply.is_pending_review == True,
        ]
        if section_id is not None:
            post_ids_stmt = select(Post.id).where(Post.section_id == section_id)
            reply_where.append(Reply.post_id.in_(post_ids_stmt))

        reply_count_result = await db.execute(
            select(func.count(Reply.id)).where(*reply_where)
        )
        total += reply_count_result.scalar() or 0

    if target_type is None or target_type == "post":
        post_where = [
            Post.is_deleted == False,
            Post.is_pending_review == True,
        ]
        if section_id is not None:
            post_where.append(Post.section_id == section_id)

        post_stmt = (
            select(Post)
            .where(*post_where)
            .order_by(Post.created_at.desc())
            .offset(skip)
            .limit(limit)
            .options(selectinload(Post.author), selectinload(Post.section))
        )
        post_result = await db.execute(post_stmt)
        posts = post_result.scalars().all()

        for post in posts:
            items.append(
                PendingReviewItem(
                    id=post.id,
                    target_type="post",
                    title=post.title,
                    content=post.content,
                    author_id=post.author_id,
                    author=AuthorBrief(
                        id=post.author.id,
                        username=post.author.username,
                        avatar=post.author.avatar,
                        reputation=post.author.reputation,
                    ),
                    section_id=post.section_id,
                    section_name=post.section.name if post.section else None,
                    created_at=post.created_at,
                )
            )

    if target_type is None or target_type == "reply":
        reply_where = [
            Reply.is_deleted == False,
            Reply.is_pending_review == True,
        ]
        if section_id is not None:
            post_ids_stmt = select(Post.id).where(Post.section_id == section_id)
            reply_where.append(Reply.post_id.in_(post_ids_stmt))

        reply_stmt = (
            select(Reply)
            .where(*reply_where)
            .order_by(Reply.created_at.desc())
            .offset(skip)
            .limit(limit)
            .options(
                selectinload(Reply.author),
                selectinload(Reply.post).selectinload(Post.section),
            )
        )
        reply_result = await db.execute(reply_stmt)
        replies = reply_result.scalars().all()

        for reply in replies:
            content_preview = reply.content[:200] + ("..." if len(reply.content) > 200 else "")
            items.append(
                PendingReviewItem(
                    id=reply.id,
                    target_type="reply",
                    title=None,
                    content=content_preview,
                    author_id=reply.author_id,
                    author=AuthorBrief(
                        id=reply.author.id,
                        username=reply.author.username,
                        avatar=reply.author.avatar,
                        reputation=reply.author.reputation,
                    ),
                    section_id=reply.post.section_id if reply.post else None,
                    section_name=reply.post.section.name if reply.post and reply.post.section else None,
                    created_at=reply.created_at,
                )
            )

    items.sort(key=lambda x: x.created_at, reverse=True)
    items = items[skip : skip + limit]

    return PaginatedPendingReviewsResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("/pending-review/{target_type}/{target_id}/approve")
async def approve_pending_review(
    target_type: str,
    target_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_moderator(db, current_user):
        raise HTTPException(status_code=403, detail="需要管理员或版主权限")

    if target_type not in ("post", "reply"):
        raise HTTPException(status_code=400, detail="目标类型无效")

    if target_type == "post":
        result = await db.execute(select(Post).where(Post.id == target_id))
        post = result.scalar_one_or_none()
        if not post:
            raise HTTPException(status_code=404, detail="帖子不存在")
        if not post.is_pending_review:
            raise HTTPException(status_code=400, detail="该帖子不在待审核状态")
        post.is_pending_review = False

        if not post.is_hidden and not post.is_deleted:
            await change_reputation(
                db,
                user_id=post.author_id,
                change=2,
                reason=f"发布帖子《{post.title}》",
                reason_type="create_post",
                operator_id=current_user.id,
                post_id=post.id,
            )
    else:
        result = await db.execute(
            select(Reply)
            .where(Reply.id == target_id)
            .options(selectinload(Reply.post))
        )
        reply = result.scalar_one_or_none()
        if not reply:
            raise HTTPException(status_code=404, detail="回复不存在")
        if not reply.is_pending_review:
            raise HTTPException(status_code=400, detail="该回复不在待审核状态")
        reply.is_pending_review = False

        if not reply.is_hidden and not reply.is_deleted:
            await change_reputation(
                db,
                user_id=reply.author_id,
                change=1,
                reason=f"回复帖子",
                reason_type="create_reply",
                operator_id=current_user.id,
                reply_id=reply.id,
            )

            if reply.post and reply.post.author_id != reply.author_id:
                await change_reputation(
                    db,
                    user_id=reply.post.author_id,
                    change=3,
                    reason=f"你的帖子被回复",
                    reason_type="post_replied",
                    operator_id=current_user.id,
                    post_id=reply.post_id,
                    reply_id=reply.id,
                )

    await db.commit()
    return {"message": "审核通过，内容已正常展示"}


@router.post("/pending-review/{target_type}/{target_id}/reject")
async def reject_pending_review(
    target_type: str,
    target_id: int,
    review_note: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await is_moderator(db, current_user):
        raise HTTPException(status_code=403, detail="需要管理员或版主权限")

    if target_type not in ("post", "reply"):
        raise HTTPException(status_code=400, detail="目标类型无效")

    if target_type == "post":
        result = await db.execute(
            select(Post).where(Post.id == target_id).options(selectinload(Post.author))
        )
        post = result.scalar_one_or_none()
        if not post:
            raise HTTPException(status_code=404, detail="帖子不存在")
        if not post.is_pending_review:
            raise HTTPException(status_code=400, detail="该帖子不在待审核状态")

        post.is_pending_review = False
        post.is_hidden = True

        author_id = post.author_id
        content_desc = f"帖子《{post.title}》"

        if post.author_id != current_user.id:
            await change_reputation(
                db,
                user_id=post.author_id,
                change=-10,
                reason=f"发布的{content_desc}因内容违规未通过审核",
                reason_type="review_rejected",
                operator_id=current_user.id,
                post_id=post.id,
            )
    else:
        result = await db.execute(
            select(Reply)
            .where(Reply.id == target_id)
            .options(selectinload(Reply.author), selectinload(Reply.post))
        )
        reply = result.scalar_one_or_none()
        if not reply:
            raise HTTPException(status_code=404, detail="回复不存在")
        if not reply.is_pending_review:
            raise HTTPException(status_code=400, detail="该回复不在待审核状态")

        reply.is_pending_review = False
        reply.is_hidden = True

        author_id = reply.author_id
        content_preview = reply.content[:50] + ("..." if len(reply.content) > 50 else "")
        content_desc = f"回复《{content_preview}》"

        if reply.author_id != current_user.id:
            await change_reputation(
                db,
                user_id=reply.author_id,
                change=-10,
                reason=f"发布的{content_desc}因内容违规未通过审核",
                reason_type="review_rejected",
                operator_id=current_user.id,
                reply_id=reply.id,
            )

    await db.commit()

    notification = Notification(
        user_id=author_id,
        type="review_result",
        content=f"您发布的{content_desc}因内容违规未通过审核，声望 -10",
        post_id=target_id if target_type == "post" else None,
        reply_id=target_id if target_type == "reply" else None,
    )
    db.add(notification)
    await db.commit()

    return {"message": "审核不通过，内容已隐藏并扣除声望 -10"}
