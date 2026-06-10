from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_admin_user, get_current_user
from app.database import get_db
from app.models import Section, User
from app.schemas import SectionCreate, SectionResponse, SectionUpdate

router = APIRouter(prefix="/api/sections", tags=["sections"])


@router.get("/", response_model=list[SectionResponse])
async def list_sections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Section).order_by(Section.sort_order))
    return result.scalars().all()


@router.get("/{section_id}", response_model=SectionResponse)
async def get_section(section_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Section).where(Section.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="板块不存在")
    return section


@router.post("/", response_model=SectionResponse, status_code=201)
async def create_section(
    section_data: SectionCreate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    section = Section(
        name=section_data.name,
        description=section_data.description,
        sort_order=section_data.sort_order,
    )
    db.add(section)
    await db.commit()
    await db.refresh(section)
    return section


@router.put("/{section_id}", response_model=SectionResponse)
async def update_section(
    section_id: int,
    section_data: SectionUpdate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Section).where(Section.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="板块不存在")

    if section_data.name is not None:
        section.name = section_data.name
    if section_data.description is not None:
        section.description = section_data.description
    if section_data.sort_order is not None:
        section.sort_order = section_data.sort_order

    await db.commit()
    await db.refresh(section)
    return section


@router.delete("/{section_id}")
async def delete_section(
    section_id: int,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Section).where(Section.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="板块不存在")

    await db.delete(section)
    await db.commit()
    return {"message": "板块已删除"}
