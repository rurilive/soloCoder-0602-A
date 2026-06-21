from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "DAG Scheduler"
    APP_VERSION: str = "0.1.0"

    HOST: str = "0.0.0.0"
    PORT: int = 1111

    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    DATABASE_URL: str = "sqlite:///./dag_scheduler.db"

    LOGS_DIR: Path = Path(__file__).parent.parent / "logs"

    CORS_ORIGINS: list[str] = [
        "http://localhost:1112",
        "http://127.0.0.1:1112",
    ]

    class Config:
        env_file = ".env"


settings = Settings()
settings.LOGS_DIR.mkdir(parents=True, exist_ok=True)
