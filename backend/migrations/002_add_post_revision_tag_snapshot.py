"""
数据库迁移脚本：为 post_revisions 表添加 tag_snapshot 字段（JSON 类型，存储标签列表快照）

使用方法：
    cd backend
    python3 migrations/002_add_post_revision_tag_snapshot.py
"""

import os
import shutil
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "forum.db")
BACKUP_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "forum.db.backup_{}".format(datetime.now().strftime("%Y%m%d_%H%M%S")),
)


def backup_database():
    if os.path.exists(DB_PATH):
        os.makedirs(os.path.dirname(BACKUP_PATH), exist_ok=True)
        shutil.copy2(DB_PATH, BACKUP_PATH)
        print("[1/4] 数据库已备份到: {}".format(BACKUP_PATH))
    else:
        print("[1/4] 数据库不存在，跳过备份")


def add_column(conn):
    cursor = conn.cursor()
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='post_revisions'"
    )
    if not cursor.fetchone():
        print("[2/4] post_revisions 表不存在，跳过迁移")
        return

    cursor.execute("PRAGMA table_info(post_revisions)")
    columns = [row[1] for row in cursor.fetchall()]

    if "tag_snapshot" in columns:
        print("[2/4] tag_snapshot 字段已存在，跳过")
        return

    print("[2/4] 为 post_revisions 表添加 tag_snapshot 字段...")
    cursor.execute(
        "ALTER TABLE post_revisions ADD COLUMN tag_snapshot TEXT DEFAULT NULL"
    )
    conn.commit()
    print("[3/4] 字段添加完成")


def verify_column(conn):
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(post_revisions)")
    columns = [row[1] for row in cursor.fetchall()]
    has_tag_snapshot = "tag_snapshot" in columns
    print("[4/4] 字段验证: {}".format("通过" if has_tag_snapshot else "失败"))
    if not has_tag_snapshot:
        raise RuntimeError("tag_snapshot 字段未添加成功")


def main():
    if not os.path.exists(DB_PATH):
        print("数据库文件不存在: {}".format(DB_PATH))
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        backup_database()
        add_column(conn)
        verify_column(conn)
        print("\n迁移完成！如果遇到问题，可使用备份文件恢复:")
        print("  cp {} {}".format(BACKUP_PATH, DB_PATH))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
