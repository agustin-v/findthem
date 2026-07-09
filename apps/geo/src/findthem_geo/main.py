from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from findthem_geo.config import settings
from findthem_geo.api.router import api_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


app = FastAPI(title="FindThem Geo", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,  # no cookies/auth headers; keeps wildcard origins valid
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


def cli() -> None:
    import uvicorn

    uvicorn.run(
        "findthem_geo.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
