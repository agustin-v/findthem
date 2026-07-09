import logging

import requests
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from findthem_geo.models.request import GenerateSegmentsRequest
from findthem_geo.models.response import SegmentsResponse
from findthem_geo.services.pipeline import run_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/segments")


@router.post("/generate", response_model=SegmentsResponse)
async def generate_segments(req: GenerateSegmentsRequest) -> SegmentsResponse:
    try:
        # Pipeline is synchronous (osmnx/Overpass/Shapely); run off the event loop.
        return await run_in_threadpool(run_pipeline, req)
    except (TimeoutError, requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
        logger.error(
            "OSM request failed for center=(%.4f, %.4f): %s: %s",
            req.center.lat, req.center.lng, type(exc).__name__, exc,
        )
        raise HTTPException(status_code=503, detail="OSM data fetch timed out. Try again later.")
    except Exception:
        logger.exception("Pipeline failed for center=(%.4f, %.4f)", req.center.lat, req.center.lng)
        raise HTTPException(status_code=500, detail="Internal error during segment generation.")
