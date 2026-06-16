"""
数据库迁移脚本：添加帖子定时发布功能
为 posts 表添加 scheduled_at 字段（可空 DateTime）

使用方法：
    cd backend
    python3 migrations/003_add_scheduled_at.py
"""

import os
import shutil
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "forum.db")
BACKUP_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    f"forum.db.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
)


def backup_database():
    if os.path.exists(DB_PATH):
        shutil.copy2(DB_PATH, BACKUP_PATH)
        print(f"[1/3] 数据库已备份到: {BACKUP_PATH}")
    else:
        print("[1/3] 数据库不存在，跳过备份")


def add_scheduled_at_column(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(posts)")
    columns = [col[1] for col in cursor.fetchall()]

    if "scheduled_at" in columns:
        print("[2/3] posts 表已存在 scheduled_at 字段，跳过")
        return

    cursor.execute(
        "ALTER TABLE posts ADD COLUMN scheduled_at DATETIME"
    )
    conn.commit()
    print("[2/3] 已为 posts 表添加 scheduled_at 字段")


def create_index(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS ix_posts_scheduled_at ON posts(scheduled_at)"
    )
    conn.commit()
    print("[3/3] 已创建 scheduled_at 索引")


def main():
    if not os.path.exists(DB_PATH):
        print(f"数据库文件不存在: {DB_PATH}")
        print("首次启动时会自动创建表结构，无需迁移")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        backup_database()
        add_scheduled_at_column(conn)
        create_index(conn)

        print("\n迁移完成！如果遇到问题，可使用备份文件恢复:")
        print(f"  cp {BACKUP_PATH} {DB_PATH}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
