import uvicorn
from app import create_app
from app.core import settings

app = create_app()


def start() -> None:
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    start()
