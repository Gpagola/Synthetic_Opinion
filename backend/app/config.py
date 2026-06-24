from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración de la aplicación, cargada desde variables de entorno / .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Base de datos
    database_url: str = "mysql+pymysql://root:root@localhost:3306/synthetic_opinion"

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"  # tareas sin razonamiento (personas, recruiting)
    openai_reasoning_model: str = "gpt-5.5"  # encuestas (focus e informe usan Claude)
    openai_reasoning_effort: str = "high"
    openai_temperature: float = 0.9

    # Anthropic (Focus Groups: turnos de conversación + informe final)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-8"
    anthropic_effort: str = "high"          # output_config.effort
    anthropic_max_tokens: int = 16000

    # CORS
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
