"""channels: webhook dedupe, status log, opaque contacts

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-14 12:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('channel_dedupe',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('provider', sa.String(length=16), nullable=False),
    sa.Column('event_id', sa.String(length=160), nullable=False),
    sa.Column('response', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_channel_dedupe')),
    sa.UniqueConstraint('provider', 'event_id', name=op.f('uq_channel_dedupe_provider'))
    )
    op.create_table('channel_log',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('ts', sa.DateTime(timezone=True), nullable=False),
    sa.Column('provider', sa.String(length=16), nullable=False),
    sa.Column('kind', sa.String(length=24), nullable=False),
    sa.Column('outcome', sa.String(length=16), nullable=False),
    sa.Column('error_code', sa.String(length=48), nullable=True),
    sa.Column('latency_ms', sa.Integer(), nullable=True),
    sa.Column('simulated', sa.Boolean(), nullable=False),
    sa.Column('detail', sa.JSON(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_channel_log'))
    )
    with op.batch_alter_table('channel_log', schema=None) as batch_op:
        batch_op.create_index('ix_channel_log_ts', ['ts'], unique=False)

    op.create_table('channel_contacts',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('channel', sa.String(length=16), nullable=False),
    sa.Column('opted_out', sa.Boolean(), nullable=False),
    sa.Column('language', sa.String(length=8), nullable=True),
    sa.Column('pending_fact', sa.String(length=32), nullable=True),
    sa.Column('last_intent', sa.String(length=32), nullable=True),
    sa.Column('message_count', sa.Integer(), nullable=False),
    sa.Column('first_seen', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_seen', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_channel_contacts'))
    )


def downgrade() -> None:
    op.drop_table('channel_contacts')
    with op.batch_alter_table('channel_log', schema=None) as batch_op:
        batch_op.drop_index('ix_channel_log_ts')
    op.drop_table('channel_log')
    op.drop_table('channel_dedupe')
