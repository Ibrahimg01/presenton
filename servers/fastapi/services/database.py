from collections.abc import AsyncGenerator
import os
import asyncio
from sqlalchemy.pool import NullPool
from utils.site_context import enabled, current_site, site_data_root
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlmodel import SQLModel

from models.sql.async_presentation_generation_status import (
    AsyncPresentationGenerationTaskModel,
)
from models.sql.image_asset import ImageAsset
from models.sql.key_value import KeyValueSqlModel
from models.sql.ollama_pull_status import OllamaPullStatus
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from models.sql.presentation_layout_code import PresentationLayoutCodeModel
from models.sql.template import TemplateModel
from models.sql.webhook_subscription import WebhookSubscription
from utils.db_utils import get_database_url_and_connect_args


database_url, connect_args = get_database_url_and_connect_args()

sql_engine: AsyncEngine = create_async_engine(database_url, connect_args=connect_args)
async_session_maker = async_sessionmaker(sql_engine, expire_on_commit=False)


_site_engines = {}
_site_init_lock = asyncio.Lock()

async def site_session_maker():
    site = current_site()
    async with _site_init_lock:
        if site not in _site_engines:
            root = site_data_root()
            os.makedirs(root, mode=0o700, exist_ok=True)
            engine = create_async_engine("sqlite+aiosqlite:///" + os.path.join(root, "fastapi.db"), poolclass=NullPool)
            async with engine.begin() as conn:
                await conn.run_sync(SQLModel.metadata.create_all)
            _site_engines[site] = async_sessionmaker(engine, expire_on_commit=False)
    return _site_engines[site]

async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    maker = await site_session_maker() if enabled() else async_session_maker
    async with maker() as session:
        yield session


# Container DB (Lives inside the container)
container_db_url = "sqlite+aiosqlite:////app/container.db"
container_db_engine: AsyncEngine = create_async_engine(
    container_db_url, connect_args={"check_same_thread": False}
)
container_db_async_session_maker = async_sessionmaker(
    container_db_engine, expire_on_commit=False
)


async def get_container_db_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with container_db_async_session_maker() as session:
        yield session


# Create Database and Tables
async def create_db_and_tables():
    async with sql_engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: SQLModel.metadata.create_all(
                sync_conn,
                tables=[
                    PresentationModel.__table__,
                    SlideModel.__table__,
                    KeyValueSqlModel.__table__,
                    ImageAsset.__table__,
                    PresentationLayoutCodeModel.__table__,
                    TemplateModel.__table__,
                    WebhookSubscription.__table__,
                    AsyncPresentationGenerationTaskModel.__table__,
                ],
            )
        )

    async with container_db_engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: SQLModel.metadata.create_all(
                sync_conn,
                tables=[OllamaPullStatus.__table__],
            )
        )


# Site storage also fixes ownership on rows created by non-UI generation APIs.
from sqlalchemy import event
@event.listens_for(PresentationModel, "before_insert")
@event.listens_for(PresentationModel, "before_update")
def bind_presentation_site(mapper, connection, target):
    if enabled():
        target.tenant_id = current_site()
