"""add max_concurrency to dags

Revision ID: 0002_add_max_concurrency
Revises: 0001_initial
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0002_add_max_concurrency'
down_revision: Union[str, None] = '0001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    if not _column_exists('dags', 'max_concurrency'):
        op.add_column('dags', sa.Column('max_concurrency', sa.Integer(), default=0, nullable=True))


def downgrade() -> None:
    if _column_exists('dags', 'max_concurrency'):
        op.drop_column('dags', 'max_concurrency')
