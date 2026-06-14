import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import SECRET_KEY, ALGORITHM, get_current_user
from app.database import get_db, async_session
from app.models import Conversation, ConversationMember, Message, User
from app.schemas import (
    AuthorBrief,
    ConversationCreate,
    ConversationListResponse,
    ConversationResponse,
    MessageCreate,
    MessageListResponse,
    MessageResponse,
    UnreadConversationsCountResponse,
)
from app.utils.sensitive_words import filter_sensitive_words

router = APIRouter(prefix="/api/chat", tags=["chat"])

active_connections: dict[int, list[WebSocket]] = {}


async def _get_conversation_unread_count(
    db: AsyncSession, conversation_id: int, user_id: int
) -> int:
    member_result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        return 0
    count_result = await db.execute(
        select(func.count(Message.id)).where(
            Message.conversation_id == conversation_id,
            Message.created_at > member.last_read_at,
        )
    )
    return count_result.scalar() or 0


async def _get_last_message(
    db: AsyncSession, conversation_id: int
) -> MessageResponse | None:
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        return None
    return MessageResponse(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        sender=AuthorBrief(
            id=msg.sender.id,
            username=msg.sender.username,
            avatar=msg.sender.avatar,
            reputation=msg.sender.reputation,
        ),
        content=msg.content,
        created_at=msg.created_at,
    )


async def _build_conversation_response(
    db: AsyncSession, conv: Conversation, user_id: int
) -> ConversationResponse:
    members = [
        AuthorBrief(id=m.user.id, username=m.user.username, avatar=m.user.avatar, reputation=m.user.reputation)
        for m in conv.members
    ]
    unread = await _get_conversation_unread_count(db, conv.id, user_id)
    last_msg = await _get_last_message(db, conv.id)
    display_name = conv.name
    if not conv.is_group and not display_name:
        for m in conv.members:
            if m.user_id != user_id:
                display_name = m.user.username
                break
    return ConversationResponse(
        id=conv.id,
        name=display_name,
        is_group=conv.is_group,
        created_at=conv.created_at,
        members=members,
        unread_count=unread,
        last_message=last_msg,
    )


@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    data: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    all_member_ids = list(set(data.member_ids + [current_user.id]))
    if len(all_member_ids) < 2:
        raise HTTPException(status_code=400, detail="会话至少需要2名成员")

    is_group = len(all_member_ids) > 2 or (data.name is not None)
    if not is_group:
        other_id = [uid for uid in all_member_ids if uid != current_user.id][0]
        existing = await db.execute(
            select(ConversationMember)
            .where(ConversationMember.user_id == current_user.id)
        )
        user_convs = existing.scalars().all()
        for uc in user_convs:
            conv_result = await db.execute(
                select(Conversation).where(Conversation.id == uc.conversation_id)
            )
            conv = conv_result.scalar_one_or_none()
            if conv and not conv.is_group:
                other_member = await db.execute(
                    select(ConversationMember).where(
                        ConversationMember.conversation_id == conv.id,
                        ConversationMember.user_id == other_id,
                    )
                )
                if other_member.scalar_one_or_none():
                    full_conv = await db.execute(
                        select(Conversation)
                        .where(Conversation.id == conv.id)
                    )
                    full = full_conv.scalar_one_or_none()
                    return await _build_conversation_response(db, full, current_user.id)

    conv = Conversation(
        name=data.name if is_group else None,
        is_group=is_group,
    )
    db.add(conv)
    await db.flush()

    for uid in all_member_ids:
        user_result = await db.execute(select(User).where(User.id == uid))
        if not user_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"用户 {uid} 不存在")
        member = ConversationMember(
            conversation_id=conv.id,
            user_id=uid,
        )
        db.add(member)

    await db.commit()
    await db.refresh(conv)
    return await _build_conversation_response(db, conv, current_user.id)


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member_rows = await db.execute(
        select(ConversationMember).where(
            ConversationMember.user_id == current_user.id
        )
    )
    members = member_rows.scalars().all()
    conv_ids = [m.conversation_id for m in members]

    if not conv_ids:
        return ConversationListResponse(items=[], total=0)

    count_stmt = select(func.count(Conversation.id)).where(Conversation.id.in_(conv_ids))
    total = (await db.execute(count_stmt)).scalar() or 0

    conv_stmt = (
        select(Conversation)
        .where(Conversation.id.in_(conv_ids))
        .order_by(Conversation.created_at.desc())
    )
    conv_result = await db.execute(conv_stmt)
    convs = conv_result.scalars().all()

    items = []
    for conv in convs:
        items.append(await _build_conversation_response(db, conv, current_user.id))

    items.sort(key=lambda x: x.last_message.created_at if x.last_message else x.created_at, reverse=True)

    return ConversationListResponse(items=items, total=total)


@router.get("/conversations/{conversation_id}/messages", response_model=MessageListResponse)
async def get_messages(
    conversation_id: int,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member_result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == current_user.id,
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="你不是该会话的成员")

    count_stmt = select(func.count(Message.id)).where(
        Message.conversation_id == conversation_id
    )
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()

    items = []
    for msg in reversed(messages):
        items.append(
            MessageResponse(
                id=msg.id,
                conversation_id=msg.conversation_id,
                sender_id=msg.sender_id,
                sender=AuthorBrief(
                    id=msg.sender.id,
                    username=msg.sender.username,
                    avatar=msg.sender.avatar,
                    reputation=msg.sender.reputation,
                ),
                content=msg.content,
                created_at=msg.created_at,
            )
        )

    return MessageListResponse(items=items, total=total)


@router.post("/conversations/{conversation_id}/read")
async def mark_conversation_read(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member_result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="你不是该会话的成员")

    member.last_read_at = datetime.utcnow()
    await db.commit()
    return {"message": "已标记为已读"}


@router.get("/unread-count", response_model=UnreadConversationsCountResponse)
async def get_unread_conversations_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member_rows = await db.execute(
        select(ConversationMember).where(
            ConversationMember.user_id == current_user.id
        )
    )
    members = member_rows.scalars().all()

    count = 0
    for m in members:
        msg_count_result = await db.execute(
            select(func.count(Message.id)).where(
                Message.conversation_id == m.conversation_id,
                Message.created_at > m.last_read_at,
            )
        )
        if (msg_count_result.scalar() or 0) > 0:
            count += 1

    return UnreadConversationsCountResponse(count=count)


@router.websocket("/ws")
async def websocket_chat(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str = payload.get("sub")
        if not user_id_str:
            await websocket.close(code=4001, reason="Invalid token")
            return
        user_id = int(user_id_str)
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()

    if user_id not in active_connections:
        active_connections[user_id] = []
    active_connections[user_id].append(websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            conversation_id = data.get("conversation_id")
            content = data.get("content", "")

            if not conversation_id or not content.strip():
                continue

            filtered_content = filter_sensitive_words(content.strip())

            async with async_session() as db:
                member_result = await db.execute(
                    select(ConversationMember).where(
                        ConversationMember.conversation_id == conversation_id,
                        ConversationMember.user_id == user_id,
                    )
                )
                if not member_result.scalar_one_or_none():
                    await websocket.send_json({"error": "你不是该会话的成员"})
                    continue

                msg = Message(
                    conversation_id=conversation_id,
                    sender_id=user_id,
                    content=filtered_content,
                )
                db.add(msg)
                await db.commit()
                await db.refresh(msg)

                sender_result = await db.execute(
                    select(User).where(User.id == user_id)
                )
                sender = sender_result.scalar_one_or_none()

                msg_data = {
                    "type": "message",
                    "id": msg.id,
                    "conversation_id": conversation_id,
                    "sender_id": user_id,
                    "sender": {
                        "id": sender.id,
                        "username": sender.username,
                        "avatar": sender.avatar,
                    },
                    "content": filtered_content,
                    "created_at": msg.created_at.isoformat(),
                }

                members_result = await db.execute(
                    select(ConversationMember).where(
                        ConversationMember.conversation_id == conversation_id,
                    )
                )
                members = members_result.scalars().all()

                for member in members:
                    if member.user_id in active_connections:
                        for ws in active_connections[member.user_id]:
                            try:
                                await ws.send_json(msg_data)
                            except Exception:
                                pass

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if user_id in active_connections:
            if websocket in active_connections[user_id]:
                active_connections[user_id].remove(websocket)
            if not active_connections[user_id]:
                del active_connections[user_id]
