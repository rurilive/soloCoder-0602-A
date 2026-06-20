"""
数据库迁移脚本：添加仅作者可见回复功能
为 posts 表添加 allow_private_replies 列
为 replies 表添加 is_private 列

使用方法：
    cd backend
    python3 migrations/005_add_private_replies.py
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


def add_allow_private_replies_column(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(posts)")
    columns = [row[1] for row in cursor.fetchall()]
    if "allow_private_replies" in columns:
        print("[2/3] posts.allow_private_replies 列已存在，跳过")
        return

    cursor.execute(
        "ALTER TABLE posts ADD COLUMN allow_private_replies BOOLEAN NOT NULL DEFAULT 0"
    )
    conn.commit()
    print("[2/3] 已为 posts 表添加 allow_private_replies 列")


def add_is_private_column(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(replies)")
    columns = [row[1] for row in cursor.fetchall()]
    if "is_private" in columns:
        print("[3/3] replies.is_private 列已存在，跳过")
        return

    cursor.execute(
        "ALTER TABLE replies ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT 0"
    )
    conn.commit()
    print("[3/3] 已为 replies 表添加 is_private 列")


def main():
    if not os.path.exists(DB_PATH):
        print(f"数据库文件不存在: {DB_PATH}")
        print("首次启动时会自动创建表结构，无需迁移")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        backup_database()
        add_allow_private_replies_column(conn)
        add_is_private_column(conn)

        print("\n迁移完成！如果遇到问题，可使用备份文件恢复:")
        print(f"  cp {BACKUP_PATH} {DB_PATH}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
