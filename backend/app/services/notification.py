import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, Post, Reply, User


async def create_notifications(
    db: AsyncSession,
    post: Post,
    reply: Reply,
    current_user: User,
    reply_content: str,
) -> None:
    notifications = []

    if post.author_id != current_user.id:
        notifications.append(Notification(
            user_id=post.author_id,
            type="reply",
            content=f"{current_user.username} 回复了你的帖子《{post.title}》",
            post_id=post.id,
            reply_id=reply.id,
            actor_id=current_user.id,
        ))

    mentioned_usernames = re.findall(r'@(\w+)', reply_content)
    if mentioned_usernames:
        mentioned_users_result = await db.execute(
            select(User).where(User.username.in_(mentioned_usernames))
        )
        mentioned_users = mentioned_users_result.scalars().all()
        for user in mentioned_users:
            if user.id != current_user.id and user.id != post.author_id:
                notifications.append(Notification(
                    user_id=user.id,
                    type="mention",
                    content=f"{current_user.username} 在帖子《{post.title}》中@了你",
                    post_id=post.id,
                    reply_id=reply.id,
                    actor_id=current_user.id,
                ))

    if notifications:
        db.add_all(notifications)
        await db.commit()
