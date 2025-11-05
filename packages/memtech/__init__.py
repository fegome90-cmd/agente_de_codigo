"""
MemTech (Memory Technology) Storage System
Multi-tier storage for agent state persistence.

Levels:
- L0: Local storage (.sf directory)
- L1: Cache layer (.sf/cache)
- L2: PostgreSQL for persistent storage
- L3: ChromaDB for vector/semantic search (NEW)
"""

from .storage_l0 import LocalStorage
from .storage_l1 import CacheStorage
from .storage_l2 import PostgreSQLStorage
from .storage_l3 import ChromaDBStorage
from .manager import MemTechManager
from .config_adapter import load_memtech_config, get_simple_config

__version__ = "2.0.0"
__all__ = [
    "LocalStorage",
    "CacheStorage",
    "PostgreSQLStorage",
    "ChromaDBStorage",
    "MemTechManager",
    "load_memtech_config",
    "get_simple_config"
]