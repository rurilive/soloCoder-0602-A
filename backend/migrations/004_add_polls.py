"""
数据库迁移脚本：添加投票功能
创建 polls、poll_options、poll_votes 表

使用方法：
    cd backend
    python3 migrations/004_add_polls.py
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
        print(f"[1/4] 数据库已备份到: {BACKUP_PATH}")
    else:
        print("[1/4] 数据库不存在，跳过备份")


def create_polls_table(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='polls'")
    if cursor.fetchone():
        print("[2/4] polls 表已存在，跳过")
        return

    cursor.execute("""
        CREATE TABLE polls (
            id INTEGER NOT NULL PRIMARY KEY,
            post_id INTEGER NOT NULL,
            is_multi BOOLEAN NOT NULL DEFAULT 0,
            max_choices INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            FOREIGN KEY(post_id) REFERENCES posts(id),
            UNIQUE(post_id)
        )
    """)
    cursor.execute("CREATE INDEX ix_polls_post_id ON polls(post_id)")
    conn.commit()
    print("[2/4] 已创建 polls 表")


def create_poll_options_table(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='poll_options'")
    if cursor.fetchone():
        print("[3/4] poll_options 表已存在，跳过")
        return

    cursor.execute("""
        CREATE TABLE poll_options (
            id INTEGER NOT NULL PRIMARY KEY,
            poll_id INTEGER NOT NULL,
            content VARCHAR(200) NOT NULL,
            vote_count INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(poll_id) REFERENCES polls(id)
        )
    """)
    cursor.execute("CREATE INDEX ix_poll_options_poll_id ON poll_options(poll_id)")
    conn.commit()
    print("[3/4] 已创建 poll_options 表")


def create_poll_votes_table(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='poll_votes'")
    if cursor.fetchone():
        print("[4/4] poll_votes 表已存在，跳过")
        return

    cursor.execute("""
        CREATE TABLE poll_votes (
            id INTEGER NOT NULL PRIMARY KEY,
            poll_id INTEGER NOT NULL,
            option_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL,
            FOREIGN KEY(poll_id) REFERENCES polls(id),
            FOREIGN KEY(option_id) REFERENCES poll_options(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(user_id, option_id)
        )
    """)
    cursor.execute("CREATE INDEX ix_poll_votes_poll_id ON poll_votes(poll_id)")
    cursor.execute("CREATE INDEX ix_poll_votes_option_id ON poll_votes(option_id)")
    cursor.execute("CREATE INDEX ix_poll_votes_user_id ON poll_votes(user_id)")
    conn.commit()
    print("[4/4] 已创建 poll_votes 表")


def main():
    if not os.path.exists(DB_PATH):
        print(f"数据库文件不存在: {DB_PATH}")
        print("首次启动时会自动创建表结构，无需迁移")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        backup_database()
        create_polls_table(conn)
        create_poll_options_table(conn)
        create_poll_votes_table(conn)

        print("\n迁移完成！如果遇到问题，可使用备份文件恢复:")
        print(f"  cp {BACKUP_PATH} {DB_PATH}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
