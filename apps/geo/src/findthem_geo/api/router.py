from fastapi import APIRouter

from findthem_geo.api.health import router as health_router
from findthem_geo.api.segments import router as segments_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(segments_router, tags=["segments"])
