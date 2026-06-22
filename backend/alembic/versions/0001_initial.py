"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('username', sa.String(), index=True, nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'revoked_tokens',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('token', sa.String(), index=True, nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'dags',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('name', sa.String(), index=True, nullable=False),
        sa.Column('description', sa.Text(), default=''),
        sa.Column('cron_expression', sa.String(), nullable=False, default='*/5 * * * *'),
        sa.Column('is_active', sa.Boolean(), default=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'dag_nodes',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('dag_id', sa.Integer(), sa.ForeignKey('dags.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('script_type', sa.String(), nullable=False, default='shell'),
        sa.Column('script_content', sa.Text(), default=''),
        sa.Column('position_x', sa.Float(), default=0.0),
        sa.Column('position_y', sa.Float(), default=0.0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'dag_edges',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('dag_id', sa.Integer(), sa.ForeignKey('dags.id'), nullable=False),
        sa.Column('source_node_id', sa.Integer(), nullable=False),
        sa.Column('target_node_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'task_executions',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('dag_id', sa.Integer(), sa.ForeignKey('dags.id'), nullable=False),
        sa.Column('status', sa.String(), default='pending'),
        sa.Column('retry_count', sa.Integer(), default=0),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'node_executions',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('task_execution_id', sa.Integer(), sa.ForeignKey('task_executions.id'), nullable=False),
        sa.Column('node_id', sa.Integer(), sa.ForeignKey('dag_nodes.id'), nullable=False),
        sa.Column('status', sa.String(), default='pending'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('log', sa.Text(), default=''),
    )


def downgrade() -> None:
    op.drop_table('node_executions')
    op.drop_table('task_executions')
    op.drop_table('dag_edges')
    op.drop_table('dag_nodes')
    op.drop_table('dags')
    op.drop_table('revoked_tokens')
    op.drop_table('users')
