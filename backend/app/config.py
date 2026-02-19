from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+asyncpg://signal:signal@localhost:5434/signal_engine"
    )
    database_url_sync: str = "postgresql://signal:signal@localhost:5434/signal_engine"
    redis_url: str = "redis://localhost:6379/0"
    serpapi_key: str = ""
    anthropic_api_key: str = ""
    kvk_api_key: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
