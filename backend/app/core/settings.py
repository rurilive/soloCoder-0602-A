from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "OAuth2.0 SSO Center"
    host: str = "0.0.0.0"
    port: int = 1111

    database_url: str = "sqlite+aiosqlite:///./oauth2_sso.db"

    secret_key: str = "your-super-secret-key-change-in-production-please"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    authorization_code_expire_seconds: int = 600

    algorithm: str = "HS256"

    cors_origins: list[str] = [
        "http://localhost:1112",
        "http://127.0.0.1:1112",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]


settings = Settings()
