"""
数据库迁移脚本：添加用户声望系统
1. 为 users 表添加 reputation 字段（默认 0）
2. 创建 reputation_logs 表

使用方法：
    cd backend
    python3 migrations/002_add_reputation_system.py
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


def add_reputation_column(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in cursor.fetchall()]

    if "reputation" in columns:
        print("[2/4] users 表已存在 reputation 字段，跳过")
        return

    cursor.execute(
        "ALTER TABLE users ADD COLUMN reputation INTEGER NOT NULL DEFAULT 0"
    )
    conn.commit()
    print("[2/4] 已为 users 表添加 reputation 字段，默认值为 0")


def create_reputation_logs_table(conn: sqlite3.Connection):
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS reputation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            change INTEGER NOT NULL,
            reason VARCHAR(500) NOT NULL,
            reason_type VARCHAR(50) NOT NULL,
            operator_id INTEGER,
            post_id INTEGER,
            reply_id INTEGER,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (operator_id) REFERENCES users(id),
            FOREIGN KEY (post_id) REFERENCES posts(id),
            FOREIGN KEY (reply_id) REFERENCES replies(id)
        )
        """
    )
    conn.commit()
    print("[3/4] 已创建 reputation_logs 表")

    cursor.execute(
        "CREATE INDEX IF NOT EXISTS ix_reputation_logs_id ON reputation_logs(id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS ix_reputation_logs_user_id ON reputation_logs(user_id)"
    )
    conn.commit()
    print("[4/4] 已创建 reputation_logs 索引")


def main():
    if not os.path.exists(DB_PATH):
        print(f"数据库文件不存在: {DB_PATH}")
        print("首次启动时会自动创建表结构，无需迁移")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        backup_database()
        add_reputation_column(conn)
        create_reputation_logs_table(conn)

        print("\n迁移完成！如果遇到问题，可使用备份文件恢复:")
        print(f"  cp {BACKUP_PATH} {DB_PATH}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
