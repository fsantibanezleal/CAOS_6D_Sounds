"""Application configuration loaded from environment variables / .env file."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime settings sourced from the environment.

    Defaults are tuned for local development. Production values are injected
    via ``/etc/fasl-auralis.env`` on the VPS (see ``deploy/`` templates).
    """

    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8104

    allowed_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8104,https://auralis.fasl-work.com"
    )

    frontend_dist: str = "frontend/dist"
    data_dir: str = "data"

    cache_ttl_manifest: int = 3600

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def frontend_dist_path(self) -> Path:
        return (PROJECT_ROOT / self.frontend_dist).resolve()

    @property
    def data_path(self) -> Path:
        return (PROJECT_ROOT / self.data_dir).resolve()

    @property
    def manifest_path(self) -> Path:
        return self.data_path / "manifest.json"

    @property
    def sounds_path(self) -> Path:
        return self.data_path / "sounds"

    @property
    def embeddings_path(self) -> Path:
        return self.data_path / "embeddings"


@lru_cache
def get_settings() -> Settings:
    return Settings()
