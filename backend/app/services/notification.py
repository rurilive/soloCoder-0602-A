import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Mention, Notification, Post, Reply, User


def parse_mentions(content: str) -> list[str]:
    return re.findall(r'@(\w+)', content)


async def create_mentions_and_notifications(
    db: AsyncSession,
    post: Post,
    current_user: User,
    content: str,
    reply: Reply | None = None,
) -> None:
    notifications = []
    mentions = []

    if reply is not None and post.author_id != current_user.id:
        notifications.append(Notification(
            user_id=post.author_id,
            type="reply",
            content=f"{current_user.username} 回复了你的帖子《{post.title}》",
            post_id=post.id,
            reply_id=reply.id,
            actor_id=current_user.id,
        ))

    mentioned_usernames = parse_mentions(content)
    if mentioned_usernames:
        mentioned_users_result = await db.execute(
            select(User).where(User.username.in_(mentioned_usernames))
        )
        mentioned_users = mentioned_users_result.scalars().all()
        notified_user_ids = {post.author_id} if reply is not None else set()
        for user in mentioned_users:
            if user.id == current_user.id:
                continue
            mentions.append(Mention(
                post_id=post.id,
                reply_id=reply.id if reply else None,
                mentioned_by_id=current_user.id,
                mentioned_user_id=user.id,
            ))
            if user.id not in notified_user_ids:
                notifications.append(Notification(
                    user_id=user.id,
                    type="mention",
                    content=f"{current_user.username} 在帖子《{post.title}》中@了你",
                    post_id=post.id,
                    reply_id=reply.id if reply else None,
                    actor_id=current_user.id,
                ))
                notified_user_ids.add(user.id)

    if mentions:
        db.add_all(mentions)
    if notifications:
        db.add_all(notifications)
    if mentions or notifications:
        await db.commit()
