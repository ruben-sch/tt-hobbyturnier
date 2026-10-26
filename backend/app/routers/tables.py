from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.schemas import TableStatusResponse
from backend.app.table_status import tables_status

router = APIRouter(prefix="/api/tables", tags=["Tables"])


@router.get("/status/{tournament_id}", response_model=List[TableStatusResponse])
def get_tables_status(tournament_id: int, db: Session = Depends(get_db)):
    return tables_status(tournament_id, db)
