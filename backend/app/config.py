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
    company_info_api_key: str = ""
    enrichment_llm_model: str = "claude-sonnet-4-20250514"
    enrichment_min_quality_threshold: float = 0.3
    kvk_api_base_url: str = "https://api.kvk.nl/api/v2"
    company_info_api_base_url: str = "https://api.companyinfo.nl"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
