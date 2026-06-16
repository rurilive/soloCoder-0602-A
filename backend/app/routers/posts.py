import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload, selectinload

from app.auth import SECRET_KEY, ALGORITHM, get_current_user, get_optional_current_user, is_moderator
from app.database import async_session, get_db
from app.models import Favorite, Mention, Moderator, Post, PostRevision, Reply, Section, User
from app.schemas import (
    AuthorBrief,
    DiffOperation,
    DiffResponse,
    MentionResponse,
    PaginatedMentionsResponse,
    PaginatedRepliesResponse,
    PaginatedResponse,
    PaginatedRevisionsResponse,
    PostCreate,
    PostListResponse,
    PostResponse,
    PostRevisionResponse,
    PostSearchItem,
    PostUpdate,
    ReplyCreate,
    ReplyResponse,
    SectionBrief,
)
from app.services.notification import create_mentions_and_notifications
from app.services.reputation import change_reputation
from app.utils.diff import compute_diff
from app.utils.sensitive_words import find_sensitive_words

router = APIRouter(prefix="/api", tags=["posts"])

post_watchers: dict[int, list[WebSocket]] = {}


def _is_scheduled(post: Post) -> bool:
    return post.scheduled_at is not None and post.scheduled_at > datetime.utcnow()


async def _broadcast_post_edit(post_id: int, editor: User, edit_reason: str | None, new_title: str, new_content: str) -> None:
    if post_id not in post_watchers:
        return

    payload = {
        "type": "post_edited",
        "post_id": post_id,
        "editor_id": editor.id,
        "editor_username": editor.username,
        "editor_avatar": editor.avatar,
        "edit_reason": edit_reason,
        "new_title": new_title,
        "new_content": new_content,
        "edited_at": datetime.utcnow().isoformat(),
    }

    for ws in list(post_watchers[post_id]):
        try:
            await ws.send_json(payload)
        except Exception:
            pass


def _can_moderate(user: User, section_id: int, moderators: list[Moderator]) -> bool:
    if user.role == "admin":
        return True
    if user.role == "moderator":
        for mod in moderators:
            if mod.user_id == user.id and mod.section_id == section_id:
                return True
    return False


async def _get_next_floor_number(db: AsyncSession, post_id: int) -> int:
    result = await db.execute(
        select(func.max(Reply.floor_number)).where(
            Reply.post_id == post_id,
            Reply.is_deleted == False,
        )
    )
    max_floor = result.scalar() or 0
    return max_floor + 1


def _build_flat_reply_response(reply: Reply) -> ReplyResponse:
    return ReplyResponse(
        id=reply.id,
        content=reply.content,
        post_id=reply.post_id,
        author_id=reply.author_id,
        author=AuthorBrief(
            id=reply.author.id,
            username=reply.author.username,
            avatar=reply.author.avatar,
            reputation=reply.author.reputation,
        ),
        parent_id=reply.parent_id,
        floor_number=reply.floor_number,
        is_deleted=reply.is_deleted,
        is_hidden=reply.is_hidden,
        is_pending_review=reply.is_pending_review,
        created_at=reply.created_at,
    )


def _build_reply_tree(replies: list[Reply]) -> list[ReplyResponse]:
    reply_map: dict[int, ReplyResponse] = {}
    root_replies: list[ReplyResponse] = []

    for reply in replies:
        if reply.is_deleted:
            continue
        reply_map[reply.id] = ReplyResponse(
            id=reply.id,
            content=reply.content,
            post_id=reply.post_id,
            author_id=reply.author_id,
            author=AuthorBrief(
                id=reply.author.id,
                username=reply.author.username,
                avatar=reply.author.avatar,
                reputation=reply.author.reputation,
            ),
            parent_id=reply.parent_id,
            floor_number=reply.floor_number,
            is_deleted=reply.is_deleted,
            is_hidden=reply.is_hidden,
            is_pending_review=reply.is_pending_review,
            created_at=reply.created_at,
            children=[],
        )

    for reply in replies:
        if reply.is_deleted:
            continue
        reply_resp = reply_map[reply.id]
        if reply.parent_id is None:
            root_replies.append(reply_resp)
        elif reply.parent_id in reply_map:
            reply_map[reply.parent_id].children.append(reply_resp)

    for reply_resp in reply_map.values():
        reply_resp.children.sort(key=lambda r: r.created_at)

    root_replies.sort(key=lambda r: r.floor_number)
    return root_replies


@router.get("/sections/{section_id}/posts", response_model=list[PostListResponse])
async def list_posts(
    section_id: int,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    result = await db.execute(select(Section).where(Section.id == section_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="板块不存在")

    is_mod = await is_moderator(db, current_user)

    base_where = [
        Post.section_id == section_id,
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
    else:
        base_where.append(Post.is_hidden == False)

    stmt = (
        select(Post)
        .where(*base_where)
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
                    reputation=post.author.reputation,
                ),
                is_pinned=post.is_pinned,
                is_deleted=post.is_deleted,
                is_scheduled=_is_scheduled(post),
                scheduled_at=post.scheduled_at,
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
    if current_user.role == "restricted":
        raise HTTPException(status_code=403, detail="您是受限用户，无法发帖，请提升声望后再试")

    result = await db.execute(select(Section).where(Section.id == section_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="板块不存在")

    if post_data.scheduled_at is not None and post_data.scheduled_at <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="定时发布时间必须为未来时间")

    combined_text = f"{post_data.title}\n{post_data.content}"
    hit_words = find_sensitive_words(combined_text)
    is_pending = len(hit_words) > 0
    is_sched = post_data.scheduled_at is not None

    post = Post(
        title=post_data.title,
        content=post_data.content,
        section_id=section_id,
        author_id=current_user.id,
        is_pending_review=is_pending,
        scheduled_at=post_data.scheduled_at,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)

    revision = PostRevision(
        post_id=post.id,
        title=post.title,
        content=post.content,
        editor_id=current_user.id,
        edit_reason=None,
        version=1,
    )
    db.add(revision)

    if not is_pending and not is_sched:
        await change_reputation(
            db,
            user_id=current_user.id,
            change=2,
            reason=f"发布帖子《{post.title}》",
            reason_type="create_post",
            post_id=post.id,
        )

    await db.commit()

    if not is_pending and not is_sched:
        await create_mentions_and_notifications(db, post, current_user, post_data.content)

    if is_pending:
        from app.routers.reports import auto_report_for_sensitive
        await auto_report_for_sensitive(db, current_user.id, "post", post.id, hit_words)

    result = await db.execute(
        select(Post).where(Post.id == post.id).options(selectinload(Post.author), selectinload(Post.replies))
    )
    post = result.scalar_one()

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
            reputation=post.author.reputation,
        ),
        is_pinned=post.is_pinned,
        is_deleted=post.is_deleted,
        is_hidden=post.is_hidden,
        is_pending_review=post.is_pending_review,
        is_scheduled=_is_scheduled(post),
        scheduled_at=post.scheduled_at,
        view_count=post.view_count,
        created_at=post.created_at,
        updated_at=post.updated_at,
        replies=[],
        is_favorited=False,
    )


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

    is_mod = await is_moderator(db, current_user)
    is_author = current_user is not None and post.author_id == current_user.id

    if post.is_hidden and not is_mod:
        raise HTTPException(status_code=404, detail="帖子不存在")

    if post.is_pending_review and not is_mod and not is_author:
        raise HTTPException(status_code=404, detail="帖子不存在")

    if _is_scheduled(post) and not is_author and not is_mod:
        raise HTTPException(status_code=404, detail="帖子不存在")

    if not post.is_pending_review and not _is_scheduled(post):
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
        if reply.is_deleted:
            continue
        if reply.is_hidden and not is_mod:
            continue
        if reply.is_pending_review and not is_mod and not (current_user and reply.author_id == current_user.id):
            continue
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
                    reputation=reply.author.reputation,
                ),
                parent_id=reply.parent_id,
                floor_number=reply.floor_number,
                is_deleted=reply.is_deleted,
                is_hidden=reply.is_hidden,
                is_pending_review=reply.is_pending_review,
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
            reputation=post.author.reputation,
        ),
        is_pinned=post.is_pinned,
        is_deleted=post.is_deleted,
        is_hidden=post.is_hidden,
        is_pending_review=post.is_pending_review,
        is_scheduled=_is_scheduled(post),
        scheduled_at=post.scheduled_at,
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

    if post_data.scheduled_at != "UNCHANGED":
        if post_data.scheduled_at is not None and post_data.scheduled_at <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="定时发布时间必须为未来时间")
        was_scheduled = _is_scheduled(post)
        post.scheduled_at = post_data.scheduled_at
        if was_scheduled and post_data.scheduled_at is None and not post.is_pending_review:
            await change_reputation(
                db,
                user_id=current_user.id,
                change=2,
                reason=f"发布帖子《{post.title}》",
                reason_type="create_post",
                post_id=post.id,
            )
            await db.flush()
            await create_mentions_and_notifications(db, post, current_user, post.content)

    if post_data.title is not None or post_data.content is not None:
        max_version_result = await db.execute(
            select(func.max(PostRevision.version)).where(PostRevision.post_id == post_id)
        )
        current_max_version = max_version_result.scalar() or 0
        next_version = current_max_version + 1

        new_title = post_data.title if post_data.title is not None else post.title
        new_content = post_data.content if post_data.content is not None else post.content

        revision = PostRevision(
            post_id=post_id,
            title=new_title,
            content=new_content,
            editor_id=current_user.id,
            edit_reason=post_data.edit_reason,
            version=next_version,
        )
        db.add(revision)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=409,
                detail="版本冲突：该帖子正被其他人同时编辑，请刷新后重试",
            )

        if post_data.title is not None:
            post.title = post_data.title
        if post_data.content is not None:
            post.content = post_data.content

        await db.commit()
    else:
        if post_data.title is not None:
            post.title = post_data.title
        if post_data.content is not None:
            post.content = post_data.content
        if post_data.title is not None or post_data.content is not None:
            await db.commit()

    await db.refresh(post)

    if post_data.title is not None or post_data.content is not None:
        await _broadcast_post_edit(
            post_id=post_id,
            editor=current_user,
            edit_reason=post_data.edit_reason,
            new_title=post.title,
            new_content=post.content,
        )

    result = await db.execute(
        select(Post)
        .where(Post.id == post_id)
        .options(
            selectinload(Post.author),
            selectinload(Post.replies).selectinload(Reply.author),
        )
    )
    post = result.scalar_one()

    is_moderator = await is_moderator(db, current_user)

    reply_responses = []
    for reply in post.replies:
        if not reply.is_deleted and (is_moderator or not reply.is_hidden):
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
                        reputation=reply.author.reputation,
                    ),
                    parent_id=reply.parent_id,
                    floor_number=reply.floor_number,
                    is_deleted=reply.is_deleted,
                    is_hidden=reply.is_hidden,
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
            reputation=post.author.reputation,
        ),
        is_pinned=post.is_pinned,
        is_deleted=post.is_deleted,
        is_hidden=post.is_hidden,
        is_scheduled=_is_scheduled(post),
        scheduled_at=post.scheduled_at,
        view_count=post.view_count,
        created_at=post.created_at,
        updated_at=post.updated_at,
        replies=reply_responses,
    )


@router.get("/posts/{post_id}/revisions", response_model=PaginatedRevisionsResponse)
async def list_post_revisions(
    post_id: int,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    post_result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )
    if not post_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="帖子不存在")

    count_result = await db.execute(
        select(func.count(PostRevision.id)).where(PostRevision.post_id == post_id)
    )
    total = count_result.scalar() or 0

    stmt = (
        select(PostRevision)
        .where(PostRevision.post_id == post_id)
        .order_by(PostRevision.version.desc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(PostRevision.editor))
    )
    result = await db.execute(stmt)
    revisions = result.scalars().all()

    items = []
    for rev in revisions:
        items.append(
            PostRevisionResponse(
                id=rev.id,
                post_id=rev.post_id,
                title=rev.title,
                content=rev.content,
                editor_id=rev.editor_id,
                editor=AuthorBrief(
                    id=rev.editor.id,
                    username=rev.editor.username,
                    avatar=rev.editor.avatar,
                    reputation=rev.editor.reputation,
                ),
                edit_reason=rev.edit_reason,
                version=rev.version,
                created_at=rev.created_at,
            )
        )

    return PaginatedRevisionsResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/posts/{post_id}/revisions/{revision_id}", response_model=PostRevisionResponse)
async def get_post_revision(
    post_id: int,
    revision_id: int,
    db: AsyncSession = Depends(get_db),
):
    rev_result = await db.execute(
        select(PostRevision)
        .where(PostRevision.id == revision_id, PostRevision.post_id == post_id)
        .options(selectinload(PostRevision.editor))
    )
    revision = rev_result.scalar_one_or_none()
    if not revision:
        raise HTTPException(status_code=404, detail="版本不存在")

    return PostRevisionResponse(
        id=revision.id,
        post_id=revision.post_id,
        title=revision.title,
        content=revision.content,
        editor_id=revision.editor_id,
        editor=AuthorBrief(
            id=revision.editor.id,
            username=revision.editor.username,
            avatar=revision.editor.avatar,
            reputation=revision.editor.reputation,
        ),
        edit_reason=revision.edit_reason,
        version=revision.version,
        created_at=revision.created_at,
    )


@router.get("/posts/{post_id}/diff", response_model=DiffResponse)
async def get_post_diff(
    post_id: int,
    old_version: int,
    new_version: int,
    db: AsyncSession = Depends(get_db),
):
    post_result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )
    post = post_result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    max_version_result = await db.execute(
        select(func.max(PostRevision.version)).where(PostRevision.post_id == post_id)
    )
    max_version = max_version_result.scalar() or 0

    if max_version == 0:
        raise HTTPException(status_code=404, detail="该帖子暂无历史版本")

    if old_version < 1 or new_version > max_version:
        raise HTTPException(status_code=400, detail=f"版本号必须在 1 到 {max_version} 之间")

    if old_version >= new_version:
        raise HTTPException(status_code=400, detail="旧版本号必须小于新版本号")

    old_result = await db.execute(
        select(PostRevision).where(
            PostRevision.post_id == post_id,
            PostRevision.version == old_version,
        )
    )
    old_rev = old_result.scalar_one_or_none()

    new_result = await db.execute(
        select(PostRevision).where(
            PostRevision.post_id == post_id,
            PostRevision.version == new_version,
        )
    )
    new_rev = new_result.scalar_one_or_none()

    if not old_rev:
        raise HTTPException(status_code=404, detail=f"版本 {old_version} 不存在")
    if not new_rev:
        raise HTTPException(status_code=404, detail=f"版本 {new_version} 不存在")

    old_title = old_rev.title
    old_content = old_rev.content
    new_title = new_rev.title
    new_content = new_rev.content

    title_diff_ops = compute_diff(old_title, new_title, word_level=False)
    content_diff_ops = compute_diff(old_content, new_content, word_level=True)

    title_diff = [DiffOperation(type=op.type, value=op.value) for op in title_diff_ops]
    content_diff = [DiffOperation(type=op.type, value=op.value) for op in content_diff_ops]

    return DiffResponse(
        old_title=old_title,
        new_title=new_title,
        title_diff=title_diff,
        content_diff=content_diff,
        old_version=old_version,
        new_version=new_version,
    )


@router.websocket("/ws/posts/{post_id}")
async def websocket_post_watch(websocket: WebSocket, post_id: int):
    token = websocket.query_params.get("token")
    user_id = None

    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id_str = payload.get("sub")
            if user_id_str:
                user_id = int(user_id_str)
        except (JWTError, ValueError):
            pass

    async with async_session() as db:
        post_result = await db.execute(
            select(Post).where(Post.id == post_id, Post.is_deleted == False)
        )
        if not post_result.scalar_one_or_none():
            await websocket.close(code=4004, reason="帖子不存在")
            return

    await websocket.accept()

    if post_id not in post_watchers:
        post_watchers[post_id] = []
    post_watchers[post_id].append(websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                msg_type = data.get("type")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                continue
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if post_id in post_watchers:
            if websocket in post_watchers[post_id]:
                post_watchers[post_id].remove(websocket)
            if not post_watchers[post_id]:
                del post_watchers[post_id]


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
    if current_user.role == "restricted":
        raise HTTPException(status_code=403, detail="您是受限用户，无法回复，请提升声望后再试")

    result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False).options(selectinload(Post.author))
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="帖子不存在")

    parent_reply = None
    if reply_data.parent_id is not None:
        parent_result = await db.execute(
            select(Reply).where(
                Reply.id == reply_data.parent_id,
                Reply.post_id == post_id,
                Reply.is_deleted == False,
            )
        )
        parent_reply = parent_result.scalar_one_or_none()
        if not parent_reply:
            raise HTTPException(status_code=404, detail="父回复不存在")

    floor_number = await _get_next_floor_number(db, post_id)

    hit_words = find_sensitive_words(reply_data.content)
    is_pending = len(hit_words) > 0

    reply = Reply(
        content=reply_data.content,
        post_id=post_id,
        author_id=current_user.id,
        parent_id=reply_data.parent_id,
        floor_number=floor_number,
        is_pending_review=is_pending,
    )
    db.add(reply)
    await db.flush()
    await db.refresh(reply)

    if not is_pending:
        await change_reputation(
            db,
            user_id=current_user.id,
            change=1,
            reason=f"在帖子《{post.title}》中回复",
            reason_type="create_reply",
            post_id=post_id,
            reply_id=reply.id,
        )

        if post.author_id != current_user.id:
            await change_reputation(
                db,
                user_id=post.author_id,
                change=3,
                reason=f"你的帖子《{post.title}》被 {current_user.username} 回复",
                reason_type="post_replied",
                post_id=post_id,
                reply_id=reply.id,
            )

    await db.commit()

    if not is_pending:
        await create_mentions_and_notifications(db, post, current_user, reply_data.content, reply)

    if is_pending:
        from app.routers.reports import auto_report_for_sensitive
        await auto_report_for_sensitive(db, current_user.id, "reply", reply.id, hit_words)

    result = await db.execute(
        select(Reply).where(Reply.id == reply.id).options(
            selectinload(Reply.author),
            selectinload(Reply.parent).selectinload(Reply.author),
        )
    )
    reply = result.scalar_one()
    return _build_flat_reply_response(reply)


def _build_reply_subtree(
    all_replies: list[Reply],
    root_reply_ids: set[int],
) -> list[ReplyResponse]:
    reply_map: dict[int, ReplyResponse] = {}
    for reply in all_replies:
        if reply.is_deleted:
            continue
        reply_map[reply.id] = ReplyResponse(
            id=reply.id,
            content=reply.content,
            post_id=reply.post_id,
            author_id=reply.author_id,
            author=AuthorBrief(
                id=reply.author.id,
                username=reply.author.username,
                avatar=reply.author.avatar,
                reputation=reply.author.reputation,
            ),
            parent_id=reply.parent_id,
            floor_number=reply.floor_number,
            is_deleted=reply.is_deleted,
            is_hidden=reply.is_hidden,
            is_pending_review=reply.is_pending_review,
            created_at=reply.created_at,
            children=[],
        )

    root_replies: list[ReplyResponse] = []
    for reply in all_replies:
        if reply.is_deleted:
            continue
        reply_resp = reply_map[reply.id]
        if reply.parent_id is None:
            if reply.id in root_reply_ids:
                root_replies.append(reply_resp)
        elif reply.parent_id in reply_map:
            reply_map[reply.parent_id].children.append(reply_resp)

    for reply_resp in reply_map.values():
        reply_resp.children.sort(key=lambda r: r.created_at)

    root_replies.sort(key=lambda r: r.floor_number)
    return root_replies


@router.get("/posts/{post_id}/replies", response_model=PaginatedRepliesResponse)
async def list_replies(
    post_id: int,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="帖子不存在")

    is_mod = await is_moderator(db, current_user)

    root_where = [
        Reply.post_id == post_id,
        Reply.is_deleted == False,
        Reply.parent_id.is_(None),
    ]
    if not is_mod:
        root_where.append(Reply.is_hidden == False)
        if current_user is not None:
            root_where.append(or_(Reply.is_pending_review == False, Reply.author_id == current_user.id))
        else:
            root_where.append(Reply.is_pending_review == False)

    count_result = await db.execute(
        select(func.count(Reply.id)).where(*root_where)
    )
    total = count_result.scalar() or 0

    paginated_root_stmt = (
        select(Reply)
        .where(*root_where)
        .order_by(Reply.floor_number.asc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(Reply.author))
    )
    paginated_root_result = await db.execute(paginated_root_stmt)
    paginated_roots = paginated_root_result.scalars().all()
    root_reply_ids = {r.id for r in paginated_roots}

    all_where = [
        Reply.post_id == post_id,
        Reply.is_deleted == False,
    ]
    if not is_mod:
        all_where.append(Reply.is_hidden == False)
        if current_user is not None:
            all_where.append(or_(Reply.is_pending_review == False, Reply.author_id == current_user.id))
        else:
            all_where.append(Reply.is_pending_review == False)

    all_replies_stmt = (
        select(Reply)
        .where(*all_where)
        .order_by(Reply.created_at.asc())
        .options(selectinload(Reply.author))
    )
    all_replies_result = await db.execute(all_replies_stmt)
    all_replies = all_replies_result.scalars().all()

    paginated_items = _build_reply_subtree(all_replies, root_reply_ids)

    return PaginatedRepliesResponse(
        items=paginated_items,
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/posts/search", response_model=PaginatedResponse)
async def search_posts(
    q: str,
    skip: int = 0,
    limit: int = 20,
    section_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip 不能为负数")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit 必须在 1-100 之间")
    if len(q) > 100:
        raise HTTPException(status_code=400, detail="搜索关键词不能超过100个字符")

    keyword = f"%{q.strip()}%" if q.strip() else None

    is_mod = False if current_user is None else await is_moderator(db, current_user)

    base_where = [
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
    else:
        base_where.append(Post.is_hidden == False)

    if keyword is not None:
        base_where.append(Post.title.ilike(keyword) | Post.content.ilike(keyword))
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
                    reputation=post.author.reputation if post.author else 0,
                ),
                is_pinned=post.is_pinned,
                is_scheduled=_is_scheduled(post),
                scheduled_at=post.scheduled_at,
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

    if post.author_id != current_user.id:
        await change_reputation(
            db,
            user_id=post.author_id,
            change=5,
            reason=f"你的帖子《{post.title}》被 {current_user.username} 收藏",
            reason_type="post_favorited",
            post_id=post_id,
        )

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


@router.get("/posts/{post_id}/mentions", response_model=PaginatedMentionsResponse)
async def list_post_mentions(
    post_id: int,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="帖子不存在")

    count_result = await db.execute(
        select(func.count(Mention.id)).where(Mention.post_id == post_id)
    )
    total = count_result.scalar() or 0

    stmt = (
        select(Mention)
        .where(Mention.post_id == post_id)
        .order_by(Mention.created_at.desc())
        .offset(skip)
        .limit(limit)
        .options(
            selectinload(Mention.mentioned_by),
            selectinload(Mention.mentioned_user),
        )
    )
    result = await db.execute(stmt)
    mentions = result.scalars().all()

    items = []
    for m in mentions:
        items.append(
            MentionResponse(
                id=m.id,
                post_id=m.post_id,
                reply_id=m.reply_id,
                mentioned_by_id=m.mentioned_by_id,
                mentioned_user_id=m.mentioned_user_id,
                mentioned_by=AuthorBrief(
                    id=m.mentioned_by.id,
                    username=m.mentioned_by.username,
                    avatar=m.mentioned_by.avatar,
                    reputation=m.mentioned_by.reputation,
                ),
                mentioned_user=AuthorBrief(
                    id=m.mentioned_user.id,
                    username=m.mentioned_user.username,
                    avatar=m.mentioned_user.avatar,
                    reputation=m.mentioned_user.reputation,
                ),
                created_at=m.created_at,
            )
        )

    return PaginatedMentionsResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/mentions", response_model=PaginatedMentionsResponse)
async def list_all_mentions(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count_result = await db.execute(
        select(func.count(Mention.id)).where(
            (Mention.mentioned_user_id == current_user.id)
            | (Mention.mentioned_by_id == current_user.id)
        )
    )
    total = count_result.scalar() or 0

    stmt = (
        select(Mention)
        .where(
            (Mention.mentioned_user_id == current_user.id)
            | (Mention.mentioned_by_id == current_user.id)
        )
        .order_by(Mention.created_at.desc())
        .offset(skip)
        .limit(limit)
        .options(
            selectinload(Mention.mentioned_by),
            selectinload(Mention.mentioned_user),
        )
    )
    result = await db.execute(stmt)
    mentions = result.scalars().all()

    items = []
    for m in mentions:
        items.append(
            MentionResponse(
                id=m.id,
                post_id=m.post_id,
                reply_id=m.reply_id,
                mentioned_by_id=m.mentioned_by_id,
                mentioned_user_id=m.mentioned_user_id,
                mentioned_by=AuthorBrief(
                    id=m.mentioned_by.id,
                    username=m.mentioned_by.username,
                    avatar=m.mentioned_by.avatar,
                    reputation=m.mentioned_by.reputation,
                ),
                mentioned_user=AuthorBrief(
                    id=m.mentioned_user.id,
                    username=m.mentioned_user.username,
                    avatar=m.mentioned_user.avatar,
                    reputation=m.mentioned_user.reputation,
                ),
                created_at=m.created_at,
            )
        )

    return PaginatedMentionsResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
    )
