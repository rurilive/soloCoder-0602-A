"""
数据库迁移脚本：为 favorites 表添加 user_id + post_id 联合唯一约束
处理步骤：
1. 检查并删除重复的收藏记录（保留最早创建的一条）
2. 创建新表（带唯一约束）并迁移数据
3. 替换旧表并重建索引

使用方法：
    cd backend
    python3 migrations/001_add_favorite_unique_constraint.py
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
        print(f"[1/5] 数据库已备份到: {BACKUP_PATH}")
    else:
        print("[1/5] 数据库不存在，跳过备份")


def dedupe_favorites(conn: sqlite3.Connection):
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT user_id, post_id, COUNT(*) as cnt, MIN(id) as keep_id
        FROM favorites
        GROUP BY user_id, post_id
        HAVING COUNT(*) > 1
        """
    )
    duplicates = cursor.fetchall()

    if not duplicates:
        print("[2/5] 未发现重复收藏记录")
        return 0

    total_removed = 0
    for user_id, post_id, cnt, keep_id in duplicates:
        cursor.execute(
            "DELETE FROM favorites WHERE user_id = ? AND post_id = ? AND id != ?",
            (user_id, post_id, keep_id),
        )
        removed = cursor.rowcount
        total_removed += removed
        print(
            f"  - 用户#{user_id} 收藏帖子#{post_id}: 共{cnt}条重复，删除{removed}条，保留#{keep_id}"
        )

    conn.commit()
    print(f"[2/5] 去重完成，共删除 {total_removed} 条重复记录")
    return total_removed


def rebuild_table_with_constraint(conn: sqlite3.Connection):
    cursor = conn.cursor()

    print("[3/5] 创建新表（带联合唯一约束）...")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS favorites_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            post_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (post_id) REFERENCES posts(id),
            UNIQUE(user_id, post_id)
        )
        """
    )

    print("[4/5] 迁移数据到新表...")
    cursor.execute(
        """
        INSERT INTO favorites_new (id, user_id, post_id, created_at)
        SELECT id, user_id, post_id, created_at FROM favorites
        """
    )
    migrated_count = cursor.rowcount

    cursor.execute("DROP TABLE IF EXISTS favorites")
    cursor.execute("ALTER TABLE favorites_new RENAME TO favorites")

    cursor.execute(
        "CREATE INDEX IF NOT EXISTS ix_favorites_id ON favorites(id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS ix_favorites_user_id ON favorites(user_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS ix_favorites_post_id ON favorites(post_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS ix_favorites_user_post ON favorites(user_id, post_id)"
    )

    conn.commit()
    print(f"[4/5] 迁移完成，共 {migrated_count} 条记录")


def verify_constraint(conn: sqlite3.Connection):
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='favorites'
        """
    )
    table_sql = cursor.fetchone()[0]

    has_unique = "UNIQUE" in table_sql.upper()
    print(f"[5/5] 唯一约束验证: {'通过' if has_unique else '失败'}")

    if not has_unique:
        raise RuntimeError("唯一约束未写入表结构，迁移可能失败")

    cursor.execute(
        "SELECT user_id, post_id FROM favorites LIMIT 1"
    )
    row = cursor.fetchone()
    if not row:
        print("[5/5] 唯一约束功能验证: 跳过（无测试数据）")
        return

    savepoint = "sp_verify_unique"
    try:
        cursor.execute(f"SAVEPOINT {savepoint}")
    except sqlite3.OperationalError:
        print("[5/5] 唯一约束功能验证: 无法验证（SAVEPOINT 不受支持，请手动检查表结构）")
        raise RuntimeError("当前 sqlite3 版本不支持 SAVEPOINT，无法执行功能验证")

    try:
        cursor.execute(
            """
            INSERT INTO favorites (user_id, post_id, created_at)
            VALUES (?, ?, ?)
            """,
            (row[0], row[1], datetime.utcnow()),
        )
        try:
            cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
        except sqlite3.OperationalError:
            pass
        print("[5/5] 唯一约束功能验证: 失败（重复数据仍可插入）")
        raise RuntimeError("唯一约束失效，重复收藏未被阻止")
    except sqlite3.IntegrityError:
        try:
            cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
        except sqlite3.OperationalError:
            pass
        print("[5/5] 唯一约束功能验证: 通过（重复数据被正确阻止）")


def main():
    if not os.path.exists(DB_PATH):
        print(f"数据库文件不存在: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='favorites'"
        )
        if not cursor.fetchone():
            print("favorites 表不存在，无需迁移")
            return

        backup_database()
        dedupe_favorites(conn)
        rebuild_table_with_constraint(conn)
        verify_constraint(conn)

        print("\n迁移完成！如果遇到问题，可使用备份文件恢复:")
        print(f"  cp {BACKUP_PATH} {DB_PATH}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
