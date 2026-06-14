from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, ReputationLog, User


SENIOR_THRESHOLD = 100
RESTRICTED_THRESHOLD = -20


async def _check_and_update_role(db: AsyncSession, user: User) -> str | None:
    old_role = user.role
    if old_role in ("admin", "moderator"):
        return None

    if user.reputation >= SENIOR_THRESHOLD and old_role == "user":
        user.role = "senior"
        return "upgrade"
    elif user.reputation < RESTRICTED_THRESHOLD and old_role == "user":
        user.role = "restricted"
        return "downgrade"
    elif user.reputation >= RESTRICTED_THRESHOLD and old_role == "restricted":
        user.role = "user"
        return "restore"
    elif user.reputation < SENIOR_THRESHOLD and old_role == "senior":
        user.role = "user"
        return "demote"
    return None


async def _send_role_change_notification(
    db: AsyncSession, user_id: int, change_type: str
) -> None:
    if change_type == "upgrade":
        content = "恭喜你！声望达到 100，已自动升级为「资深用户」"
    elif change_type == "downgrade":
        content = "很遗憾，你的声望低于 -20，已被自动降级为「受限用户」"
    elif change_type == "restore":
        content = "你的声望已恢复至 -20 以上，已恢复为「普通用户」"
    elif change_type == "demote":
        content = "你的声望低于 100，已从「资深用户」降为「普通用户」"
    else:
        return

    notification = Notification(
        user_id=user_id,
        type="reputation_role",
        content=content,
    )
    db.add(notification)


async def change_reputation(
    db: AsyncSession,
    user_id: int,
    change: int,
    reason: str,
    reason_type: str,
    operator_id: int | None = None,
    post_id: int | None = None,
    reply_id: int | None = None,
) -> None:
    if change == 0:
        return

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return

    user.reputation += change

    log = ReputationLog(
        user_id=user_id,
        change=change,
        reason=reason,
        reason_type=reason_type,
        operator_id=operator_id,
        post_id=post_id,
        reply_id=reply_id,
    )
    db.add(log)

    role_change = await _check_and_update_role(db, user)

    if role_change:
        await _send_role_change_notification(db, user_id, role_change)

    if operator_id is not None:
        sign = "+" if change > 0 else ""
        notif_content = f"你的声望{sign}{change}（当前：{user.reputation}）：{reason}"
        db.add(Notification(
            user_id=user_id,
            type="reputation_change",
            content=notif_content,
            post_id=post_id,
            reply_id=reply_id,
            actor_id=operator_id,
        ))
