"""add purposes & production_at safely

Revision ID: 4221af81017f
Revises: 5b3117608e1d
Create Date: 2025-11-28 13:20:45.726944

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4221af81017f'
down_revision: Union[str, Sequence[str], None] = '5b3117608e1d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
