"""
MemTech Configuration Adapter
Bridges our simple MemTech system with MemTech Universal configuration format.
"""

import os
import yaml
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class MemTechUniversalConfig:
    """Configuration compatible with MemTech Universal format."""

    # Memory system settings
    storage_path: str = os.path.abspath("./data")
    max_memory_mb: int = 1024

    # Layer configurations
    l0_config: Dict[str, Any] = None
    l1_config: Dict[str, Any] = None
    l2_config: Dict[str, Any] = None
    l3_config: Dict[str, Any] = None

    # Database connections
    redis_url: str = "redis://localhost:6379"
    database_url: str = "sqlite:///./data/memtech.db"

    # Performance settings
    cache_size: int = 1000
    batch_size: int = 100
    max_concurrent_operations: int = 10

    # Logging
    log_level: str = "INFO"

    # Security
    encryption_enabled: bool = False
    encryption_key: Optional[str] = None

    # Monitoring
    metrics_enabled: bool = False

    def __post_init__(self):
        """Initialize default configurations."""
        if self.l0_config is None:
            self.l0_config = {
                "enabled": True,
                "max_size_mb": 100,
                "max_items": 1000,
                "ttl_seconds": 3600,
                "eviction_strategy": "lru",
            }

        if self.l1_config is None:
            self.l1_config = {
                "enabled": True,
                "max_size_mb": 500,
                "max_items": 10000,
                "ttl_seconds": 86400,
                "eviction_strategy": "lru",
            }

        if self.l2_config is None:
            self.l2_config = {
                "enabled": True,
                "max_size_mb": 1024,
                "max_items": 100000,
                "ttl_seconds": None,
                "compression": True,
                "eviction_strategy": "lru",
            }

        if self.l3_config is None:
            self.l3_config = {
                "enabled": False,
                "collection_name": "memtech_memory",
                "embedding_model": "default",
                "vector_dimension": 384,
                "batch_size": 100,
                "timeout_seconds": 30,
                "retry_attempts": 3,
                "fallback_to_l2": True,
            }


class ConfigLoader:
    """Loads and manages MemTech Universal configuration."""

    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or self._find_config_file()
        self.config = self._load_config()

    def _find_config_file(self) -> str:
        """Find configuration file in standard locations."""
        possible_paths = [
            "./config/default.yaml",
            "./config.yaml",
            "./memtech.yaml",
            "../memtech-universal/config/default.yaml",
            "../../memtech-universal/config/default.yaml",
        ]

        for path in possible_paths:
            if Path(path).exists():
                return path

        # Create default config if none found
        return self._create_default_config()

    def _create_default_config(self) -> str:
        """Create a default configuration file."""
        config_dir = Path("./config")
        config_dir.mkdir(exist_ok=True)

        default_config_path = config_dir / "default.yaml"

        default_config = {
            "memory": {
                "storage_path": "./data",
                "max_memory_mb": 1024,
                "l0_config": {
                    "enabled": True,
                    "max_size_mb": 100,
                    "max_items": 1000,
                    "ttl_seconds": 3600,
                    "eviction_strategy": "lru",
                },
                "l1_config": {
                    "enabled": True,
                    "max_size_mb": 500,
                    "max_items": 10000,
                    "ttl_seconds": 86400,
                    "eviction_strategy": "lru",
                },
                "l2_config": {
                    "enabled": True,
                    "max_size_mb": 1024,
                    "max_items": 100000,
                    "ttl_seconds": None,
                    "compression": True,
                    "eviction_strategy": "lru",
                },
                "redis_url": "${REDIS_URL:-redis://localhost:6379}",
                "database_url": "${DATABASE_URL:-sqlite:///./data/memtech.db}",
                "cache_size": 1000,
                "log_level": "INFO",
            }
        }

        with open(default_config_path, "w") as f:
            yaml.dump(default_config, f, default_flow_style=False)

        return str(default_config_path)

    def _load_config(self) -> MemTechUniversalConfig:
        """Load configuration from file and environment."""
        # Load YAML config
        config_data = {}
        if Path(self.config_path).exists():
            with open(self.config_path, "r") as f:
                config_data = yaml.safe_load(f) or {}

        # Extract memory configuration
        memory_config = config_data.get("memory", {})

        # Parse environment variables with better handling for DATABASE_URL
        database_url = (
            os.getenv("DATABASE_URL")
            or os.getenv("MEMTECH_MEMORY_DATABASE_URL")
            or memory_config.get("database_url", "sqlite:///./data/memtech.db")
        )

        # Handle default database configuration from startkit-main patterns
        if not database_url or database_url.startswith("${"):
            # Check for startkit-main style configuration
            pg_host = os.getenv("POSTGRES_HOST", "localhost")
            pg_port = os.getenv("POSTGRES_PORT", "5432")
            pg_db = os.getenv("POSTGRES_DB", "memory_verification")
            pg_user = os.getenv("POSTGRES_USER", "postgres")
            pg_password = os.getenv("POSTGRES_PASSWORD", "postgres")

            # Use surprise_metrics_staging if available (from startkit-main)
            if os.getenv("DB_PASSWORD"):  # startkit-main staging environment
                pg_user = "surprise_user"
                pg_password = os.getenv("DB_PASSWORD")
                pg_db = "surprise_metrics_staging"
                pg_port = "5433"

            # Build DATABASE_URL if not set
            if not database_url or database_url.startswith("${"):
                database_url = (
                    f"postgresql://{pg_user}:{pg_password}@{pg_host}:{pg_port}/{pg_db}"
                )

        env_vars = {
            "storage_path": os.getenv("MEMTECH_MEMORY_STORAGE_PATH")
            or memory_config.get("storage_path", "./data"),
            "max_memory_mb": int(os.getenv("MEMTECH_MEMORY_MAX_MB", "0"))
            or memory_config.get("max_memory_mb", 1024),
            "redis_url": os.getenv("REDIS_URL")
            or os.getenv("MEMTECH_MEMORY_REDIS_URL")
            or memory_config.get("redis_url", "redis://localhost:6379"),
            "database_url": database_url,
            "cache_size": int(os.getenv("MEMTECH_MEMORY_CACHE_SIZE", "0"))
            or memory_config.get("cache_size", 1000),
            "log_level": os.getenv("MEMTECH_MEMORY_LOG_LEVEL")
            or memory_config.get("log_level", "INFO"),
            "encryption_enabled": os.getenv("ENCRYPTION_KEY") is not None,
            "encryption_key": os.getenv("ENCRYPTION_KEY"),
            "metrics_enabled": os.getenv("MEMTECH_METRICS_ENABLED", "false").lower()
            == "true",
        }

        # Layer configurations
        l0_config = memory_config.get("l0_config", {})
        l1_config = memory_config.get("l1_config", {})
        l2_config = memory_config.get("l2_config", {})

        # Ensure paths are absolute and directories exist
        base_path = env_vars["storage_path"]
        os.makedirs(base_path, exist_ok=True)
        os.makedirs(base_path + "/l0", exist_ok=True)
        os.makedirs(base_path + "/l1", exist_ok=True)

        # L3 configuration from environment
        l3_enabled = os.getenv("MEMTECH_L3_ENABLED", "false").lower() == "true"
        l3_config = {
            "enabled": l3_enabled,
            "collection_name": os.getenv(
                "MEMTECH_L3_COLLECTION_NAME", "memtech_memory"
            ),
            "embedding_model": os.getenv("MEMTECH_L3_EMBEDDING_MODEL", "default"),
            "vector_dimension": int(os.getenv("MEMTECH_L3_VECTOR_DIMENSION", "384")),
            "batch_size": int(os.getenv("MEMTECH_L3_BATCH_SIZE", "100")),
            "timeout_seconds": int(os.getenv("MEMTECH_L3_TIMEOUT_SECONDS", "30")),
            "retry_attempts": int(os.getenv("MEMTECH_L3_RETRY_ATTEMPTS", "3")),
            "fallback_to_l2": os.getenv("MEMTECH_L3_FALLBACK_TO_L2", "true").lower()
            == "true",
        }

        return MemTechUniversalConfig(
            storage_path=env_vars["storage_path"],
            max_memory_mb=env_vars["max_memory_mb"],
            l0_config=l0_config,
            l1_config=l1_config,
            l2_config=l2_config,
            l3_config=l3_config,
            redis_url=env_vars["redis_url"],
            database_url=env_vars["database_url"],
            cache_size=env_vars["cache_size"],
            log_level=env_vars["log_level"],
            encryption_enabled=env_vars["encryption_enabled"],
            encryption_key=env_vars["encryption_key"],
            metrics_enabled=env_vars["metrics_enabled"],
        )

    def to_simple_config(self) -> Dict[str, Any]:
        """Convert Universal config to our simple MemTech manager format."""
        return {
            "l0": {
                "enabled": self.config.l0_config.get("enabled", True),
                "base_path": self.config.storage_path + "/l0",
                "max_size_mb": self.config.l0_config.get("max_size_mb", 100),
            },
            "l1": {
                "enabled": self.config.l1_config.get("enabled", True),
                "base_path": self.config.storage_path + "/l1",
                "max_items": self.config.l1_config.get("max_items", 1000),
                "default_ttl": self.config.l1_config.get("ttl_seconds", 86400),
            },
            "l2": {
                "enabled": self.config.l2_config.get("enabled", True),
                "connection_string": self.config.database_url,
                "auto_cleanup": True,
                "cleanup_interval": 3600,
            },
            "l3": {
                "enabled": self.config.l3_config.get("enabled", False),
                "config": self.config.l3_config,
            },
            "strategy": {
                "write_through": True,
                "read_through": True,
                "fallback_order": ["l1", "l0", "l2"],
                "cache_ttl": self.config.l0_config.get("ttl_seconds", 3600),
            },
            "logging": {
                "level": self.config.log_level,
                "metrics_enabled": self.config.metrics_enabled,
            },
        }


def load_memtech_config(config_path: Optional[str] = None) -> MemTechUniversalConfig:
    """Load MemTech configuration from file or environment."""
    loader = ConfigLoader(config_path)
    return loader.config


def get_simple_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """Get simplified configuration for our MemTech manager."""
    loader = ConfigLoader(config_path)
    return loader.to_simple_config()

