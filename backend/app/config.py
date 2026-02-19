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
    apollo_api_key: str = ""
    enrichment_llm_model: str = "claude-sonnet-4-20250514"
    chat_model: str = "claude-sonnet-4-20250514"
    enrichment_min_quality_threshold: float = 0.3
    scoring_hot_threshold: int = 80
    scoring_warm_threshold: int = 50
    kvk_api_base_url: str = "https://api.kvk.nl/api/v2"
    apollo_api_base_url: str = "https://api.apollo.io/api/v1"
    api_cache_enabled: bool = True
    api_cache_max_age_days: int = 30
    admin_token: str | None = None

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
