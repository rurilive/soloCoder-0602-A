"""add condition and variable fields

Revision ID: 0003_condition_and_vars
Revises: 0002_add_max_concurrency
Create Date: 2024-01-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = '0003_condition_and_vars'
down_revision: Union[str, None] = '0002_add_max_concurrency'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    inspector = inspect(conn)
    return inspector.has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    inspector = inspect(conn)
    if not inspector.has_table(table_name):
        return False
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    if _table_exists('dag_nodes'):
        if not _column_exists('dag_nodes', 'condition_expression'):
            op.add_column('dag_nodes', sa.Column('condition_expression', sa.String(), default=''))
        if not _column_exists('dag_nodes', 'expose_output_vars'):
            op.add_column('dag_nodes', sa.Column('expose_output_vars', sa.Boolean(), default=False))

    if _table_exists('node_executions'):
        if not _column_exists('node_executions', 'skip_reason'):
            op.add_column('node_executions', sa.Column('skip_reason', sa.String(), default=''))
        if not _column_exists('node_executions', 'output_vars'):
            op.add_column('node_executions', sa.Column('output_vars', sa.JSON(), default=dict))


def downgrade() -> None:
    if _table_exists('dag_nodes'):
        if _column_exists('dag_nodes', 'expose_output_vars'):
            op.drop_column('dag_nodes', 'expose_output_vars')
        if _column_exists('dag_nodes', 'condition_expression'):
            op.drop_column('dag_nodes', 'condition_expression')

    if _table_exists('node_executions'):
        if _column_exists('node_executions', 'output_vars'):
            op.drop_column('node_executions', 'output_vars')
        if _column_exists('node_executions', 'skip_reason'):
            op.drop_column('node_executions', 'skip_reason')
