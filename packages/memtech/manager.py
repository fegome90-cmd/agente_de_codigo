"""
MemTech Manager: Multi-tier Storage Manager
Orchestrates L0 (Local), L1 (Cache), L2 (PostgreSQL), and L3 (ChromaDB) storage.
"""

import json
import time
from typing import Dict, Any, Optional, List, Union
from pathlib import Path
from datetime import datetime

from .storage_l0 import LocalStorage
from .storage_l1 import CacheStorage
from .storage_l2 import PostgreSQLStorage
from .storage_l3 import ChromaDBStorage
from .config_adapter import get_simple_config, load_memtech_config


class MemTechManager:
    """Multi-tier storage manager with automatic fallback and caching."""

    def __init__(self, config: Optional[Dict[str, Any]] = None, universal_config_path: Optional[str] = None):
        """
        Initialize MemTech manager.

        Args:
            config: Configuration dictionary with storage settings (legacy)
            universal_config_path: Path to MemTech Universal config file
        """
        # Load configuration (prefer Universal format)
        if universal_config_path or not config:
            self.config = get_simple_config(universal_config_path)
            self.universal_config = load_memtech_config(universal_config_path)
        else:
            self.config = config
            self.universal_config = None

        # Initialize storage layers
        self.l0 = None  # Local storage
        self.l1 = None  # Cache storage
        self.l2 = None  # PostgreSQL storage
        self.l3 = None  # ChromaDB storage (NEW)

        self._initialize_storage()

        # Performance metrics
        self.metrics = {
            "operations": {
                "store": {"count": 0, "total_time": 0, "errors": 0},
                "retrieve": {"count": 0, "total_time": 0, "errors": 0, "hits": 0},
                "delete": {"count": 0, "total_time": 0, "errors": 0},
                "search": {"count": 0, "total_time": 0, "errors": 0}  # NEW: L3 search operations
            },
            "layers_used": {
                "l0": 0,
                "l1": 0,
                "l2": 0,
                "l3": 0  # NEW: L3 usage tracking
            }
        }

    def _get_default_config(self) -> Dict[str, Any]:
        """Get default configuration."""
        return {
            "l0": {
                "enabled": True,
                "base_path": ".sf",
                "max_size_mb": 100
            },
            "l1": {
                "enabled": True,
                "base_path": ".sf/cache",
                "max_items": 1000,
                "default_ttl": 3600  # 1 hour
            },
            "l2": {
                "enabled": True,
                "connection_string": None,
                "auto_cleanup": True,
                "cleanup_interval": 3600  # 1 hour
            },
            "strategy": {
                "cache_ttl": 3600,  # Cache results for 1 hour
                "write_through": True,  # Write to all layers
                "read_through": True,  # Cache misses populate cache
                "fallback_order": ["l1", "l0", "l2"]  # Try cache first
            }
        }

    def _initialize_storage(self):
        """Initialize storage layers based on configuration."""
        try:
            # Initialize L0 (Local Storage)
            if self.config.get("l0", {}).get("enabled", True):
                self.l0 = LocalStorage(
                    base_path=self.config["l0"]["base_path"],
                    max_size_mb=self.config["l0"]["max_size_mb"]
                )
                print("✅ L0 (Local Storage) initialized")

            # Initialize L1 (Cache Storage)
            if self.config.get("l1", {}).get("enabled", True):
                self.l1 = CacheStorage(
                    base_path=self.config["l1"]["base_path"],
                    max_items=self.config["l1"]["max_items"],
                    default_ttl=self.config["l1"]["default_ttl"]
                )
                print("✅ L1 (Cache Storage) initialized")

            # Initialize L2 (PostgreSQL Storage)
            if self.config.get("l2", {}).get("enabled", True):
                self.l2 = PostgreSQLStorage(
                    connection_string=self.config["l2"].get("connection_string")
                )
                if self.l2 and self.l2.pool:
                    print("✅ L2 (PostgreSQL Storage) initialized")
                else:
                    print("⚠️ L2 (PostgreSQL Storage) initialization failed - using fallback")
                    self.l2 = None

            # Initialize L3 (ChromaDB Storage) - NEW
            if self.config.get("l3", {}).get("enabled", False):
                self.l3 = ChromaDBStorage(self.config["l3"])
                if self.l3.enabled:
                    print("✅ L3 (ChromaDB Storage) initialized")
                else:
                    print("⚠️ L3 (ChromaDB Storage) initialization failed - using fallback")
                    self.l3 = None

        except Exception as e:
            print(f"❌ Error initializing storage: {e}")

    def _time_operation(self, operation_name: str, operation_func, *args, **kwargs):
        """Time an operation and update metrics."""
        start_time = time.time()
        try:
            result = operation_func(*args, **kwargs)
            duration = time.time() - start_time

            self.metrics["operations"][operation_name]["count"] += 1
            self.metrics["operations"][operation_name]["total_time"] += duration

            if operation_name == "retrieve" and result is not None:
                self.metrics["operations"][operation_name]["hits"] += 1

            return result

        except Exception as e:
            self.metrics["operations"][operation_name]["errors"] += 1
            print(f"Error in {operation_name} operation: {e}")
            raise

    def store(self, key: str, data: Dict[str, Any], ttl: Optional[int] = None,
              tags: Optional[List[str]] = None) -> bool:
        """
        Store data in multi-tier storage.

        Args:
            key: Storage key
            data: Data to store
            ttl: Time to live for cache layer
            tags: Tags for PostgreSQL and ChromaDB storage

        Returns:
            True if successful in at least one layer
        """
        def _store_operation():
            success_count = 0

            # Prepare data with tags for all layers
            if tags:
                data["tags"] = tags

            # Strategy: Write-through (write to all available layers)
            if self.config["strategy"]["write_through"]:
                # Store in L0 (Local)
                if self.l0:
                    if self.l0.store(key, data):
                        success_count += 1
                        self.metrics["layers_used"]["l0"] += 1

                # Store in L1 (Cache) with TTL
                if self.l1:
                    cache_ttl = ttl or self.config["strategy"]["cache_ttl"]
                    if self.l1.set(key, data, cache_ttl):
                        success_count += 1
                        self.metrics["layers_used"]["l1"] += 1

                # Store in L2 (PostgreSQL)
                if self.l2:
                    if self.l2.store(key, data, ttl, tags):
                        success_count += 1
                        self.metrics["layers_used"]["l2"] += 1

                # Store in L3 (ChromaDB) - NEW
                if self.l3 and self.l3.enabled:
                    if self.l3.store(key, data):
                        success_count += 1
                        self.metrics["layers_used"]["l3"] += 1

            else:
                # Write-through disabled - use fastest available layer
                if self.l0:
                    if self.l0.store(key, data):
                        success_count += 1
                        self.metrics["layers_used"]["l0"] += 1
                elif self.l3 and self.l3.enabled:  # Try L3 next
                    if self.l3.store(key, data):
                        success_count += 1
                        self.metrics["layers_used"]["l3"] += 1
                elif self.l2:
                    if self.l2.store(key, data, ttl, tags):
                        success_count += 1
                        self.metrics["layers_used"]["l2"] += 1

            return success_count > 0

        return self._time_operation("store", _store_operation)

    def retrieve(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve data from multi-tier storage.

        Args:
            key: Storage key

        Returns:
            Stored data or None if not found
        """
        def _retrieve_operation():
            # Strategy: Try cache first, then fallback
            fallback_order = self.config["strategy"]["fallback_order"]

            for layer in fallback_order:
                if layer == "l1" and self.l1:
                    # Try cache first
                    data = self.l1.get(key)
                    if data is not None:
                        self.metrics["layers_used"]["l1"] += 1
                        return data

                elif layer == "l0" and self.l0:
                    # Try local storage
                    data = self.l0.retrieve(key)
                    if data is not None:
                        self.metrics["layers_used"]["l0"] += 1

                        # Cache the result (read-through)
                        if self.config["strategy"]["read_through"] and self.l1:
                            cache_ttl = self.config["strategy"]["cache_ttl"]
                            self.l1.set(key, data, cache_ttl)

                        return data

                elif layer == "l2" and self.l2:
                    # Try PostgreSQL
                    data = self.l2.retrieve(key)
                    if data is not None:
                        self.metrics["layers_used"]["l2"] += 1

                        # Cache the result (read-through)
                        if self.config["strategy"]["read_through"] and self.l1:
                            cache_ttl = self.config["strategy"]["cache_ttl"]
                            self.l1.set(key, data, cache_ttl)

                        # Also store in local storage for faster future access
                        if self.l0:
                            self.l0.store(key, data)

                        return data

            return None

        return self._time_operation("retrieve", _retrieve_operation)

    def delete(self, key: str) -> bool:
        """
        Delete data from all storage layers.

        Args:
            key: Storage key

        Returns:
            True if successful in at least one layer
        """
        def _delete_operation():
            success_count = 0

            # Delete from all available layers
            if self.l0:
                if self.l0.delete(key):
                    success_count += 1

            if self.l1:
                if self.l1.delete(key):
                    success_count += 1

            if self.l2:
                if self.l2.delete(key):
                    success_count += 1

            return success_count > 0

        return self._time_operation("delete", _delete_operation)

    def exists(self, key: str) -> bool:
        """Check if key exists in any storage layer."""
        # Try cache first
        if self.l1 and self.l1.exists(key):
            return True

        # Try local storage
        if self.l0 and self.l0.exists(key):
            return True

        # Try PostgreSQL
        if self.l2 and self.l2.exists(key):
            return True

        return False

    def list_keys(self, pattern: Optional[str] = None, limit: Optional[int] = None) -> List[str]:
        """
        List keys from all storage layers.

        Args:
            pattern: Optional pattern to filter keys
            limit: Maximum number of keys to return

        Returns:
            Unified list of unique keys
        """
        all_keys = set()

        # Get keys from each layer
        if self.l1:
            l1_keys = set(self.l1.list_keys(pattern))
            all_keys.update(l1_keys)

        if self.l0:
            l0_keys = set(self.l0.list_keys(pattern))
            all_keys.update(l0_keys)

        if self.l2:
            l2_keys = set(self.l2.list_keys(pattern, limit))
            all_keys.update(l2_keys)

        # Convert to list and apply limit
        keys = list(all_keys)
        if limit:
            keys = keys[:limit]

        return keys

    def get_info(self, key: str) -> Dict[str, Any]:
        """Get comprehensive information about a key."""
        info = {
            "key": key,
            "exists": self.exists(key),
            "layers": {}
        }

        # Get info from each layer
        if self.l1:
            l1_info = self.l1.get_info(key)
            if l1_info:
                info["layers"]["l1"] = l1_info

        if self.l0:
            l0_info = self.l0.get_info(key)
            if l0_info:
                info["layers"]["l0"] = l0_info

        if self.l2:
            l2_info = self.l2.get_info(key)
            if l2_info:
                info["layers"]["l2"] = l2_info

        return info

    def get_system_info(self) -> Dict[str, Any]:
        """Get comprehensive system information."""
        system_info = {
            "timestamp": datetime.now().isoformat(),
            "config": self.config,
            "storage_layers": {},
            "metrics": self.metrics,
            "performance": self._calculate_performance_metrics()
        }

        # Get info from each storage layer
        if self.l0:
            system_info["storage_layers"]["l0"] = self.l0.get_storage_info()

        if self.l1:
            system_info["storage_layers"]["l1"] = self.l1.get_cache_info()

        if self.l2:
            system_info["storage_layers"]["l2"] = self.l2.get_storage_info()

        return system_info

    def _calculate_performance_metrics(self) -> Dict[str, Any]:
        """Calculate performance metrics from operation data."""
        ops = self.metrics["operations"]

        def _avg_time(op_name):
            count = ops[op_name]["count"]
            if count == 0:
                return 0
            return ops[op_name]["total_time"] / count

        def _hit_rate(op_name):
            count = ops[op_name]["count"]
            hits = ops[op_name]["hits"]
            if count == 0:
                return 0
            return (hits / count) * 100

        return {
            "store": {
                "operations": ops["store"]["count"],
                "avg_time_ms": _avg_time("store") * 1000,
                "error_rate": (ops["store"]["errors"] / max(ops["store"]["count"], 1)) * 100
            },
            "retrieve": {
                "operations": ops["retrieve"]["count"],
                "avg_time_ms": _avg_time("retrieve") * 1000,
                "hit_rate": _hit_rate("retrieve"),
                "error_rate": (ops["retrieve"]["errors"] / max(ops["retrieve"]["count"], 1)) * 100
            },
            "delete": {
                "operations": ops["delete"]["count"],
                "avg_time_ms": _avg_time("delete") * 1000,
                "error_rate": (ops["delete"]["errors"] / max(ops["delete"]["count"], 1)) * 100
            }
        }

    def cleanup(self) -> Dict[str, int]:
        """Run cleanup operations on all storage layers."""
        cleanup_results = {}

        # Cleanup L1 cache
        if self.l1:
            cleanup_results["l1"] = self.l1.cleanup()

        # Cleanup L2 expired items
        if self.l2:
            cleanup_results["l2"] = self.l2.cleanup_expired()

        # L0 has automatic cleanup
        cleanup_results["l0"] = 0

        return cleanup_results

    def vacuum(self) -> bool:
        """Run VACUUM on PostgreSQL storage."""
        if self.l2:
            return self.l2.vacuum()
        return False

    def backup(self, backup_path: str) -> Dict[str, bool]:
        """
        Create backup of all storage layers.

        Args:
            backup_path: Base path for backup

        Returns:
            Dictionary with backup results for each layer
        """
        backup_base = Path(backup_path)
        backup_base.mkdir(parents=True, exist_ok=True)

        results = {}

        # Backup L0
        if self.l0:
            l0_backup_path = backup_base / "l0"
            results["l0"] = self.l0.backup(str(l0_backup_path))

        # L1 (Cache) doesn't need backup - it's ephemeral
        results["l1"] = True  # No backup needed for cache

        # L2 backup would be done at database level
        results["l2"] = True  # Database backup handled separately

        return results

    def restore(self, backup_path: str) -> Dict[str, bool]:
        """
        Restore storage from backup.

        Args:
            backup_path: Base path for backup

        Returns:
            Dictionary with restore results for each layer
        """
        backup_base = Path(backup_path)
        results = {}

        # Restore L0
        if self.l0 and (backup_base / "l0").exists():
            l0_backup_path = backup_base / "l0"
            results["l0"] = self.l0.restore(str(l0_backup_path))

        # Clear L1 cache after restore
        if self.l1:
            self.l1.clear()
            results["l1"] = True

        # L2 restore handled at database level
        results["l2"] = True

        return results

    def clear_all(self) -> bool:
        """Clear all storage layers."""
        success = True

        if self.l0:
            success &= self.l0.clear()

        if self.l1:
            success &= self.l1.clear()

        if self.l2:
            # Don't clear entire database, just our tables
            success &= self.l2.cleanup_expired(batch_size=1000000)

        return success

    def search(self, query: str, limit: int = 10, tags: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Perform semantic search using L3 ChromaDB storage.

        Args:
            query: Search query string
            limit: Maximum number of results
            tags: Optional tag filters

        Returns:
            List of search results with similarity scores
        """
        if not self.l3 or not self.l3.enabled:
            print("⚠️ L3 (ChromaDB) not available for semantic search")
            return []

        def _search_operation():
            try:
                results = self.l3.search(query, limit, tags)
                self.metrics["layers_used"]["l3"] += 1
                return results
            except Exception as e:
                print(f"Error in search operation: {e}")
                self.metrics["operations"]["search"]["errors"] += 1
                return []

        return self._time_operation("search", _search_operation)

    def close(self):
        """Close all storage connections."""
        if self.l2:
            self.l2.close()

        if self.l3:
            self.l3.close()

        # Print final metrics
        print("\n📊 MemTech Performance Summary:")
        performance = self._calculate_performance_metrics()
        for op_name, metrics in performance.items():
            if metrics["operations"] > 0:
                print(f"  {op_name.title()}: {metrics['operations']} ops, "
                      f"{metrics['avg_time_ms']:.1f}ms avg, "
                      f"{metrics.get('hit_rate', 0):.1f}% hit rate")

    def health_check(self) -> Dict[str, Any]:
        """Perform comprehensive health check across all layers."""
        health_status = {
            "overall_status": "healthy",
            "layers": {},
            "timestamp": datetime.now().isoformat()
        }

        # Check L0
        if self.l0:
            try:
                l0_info = self.l0.get_storage_info()
                health_status["layers"]["l0"] = {
                    "status": "healthy",
                    "storage_type": "L0",
                    "total_files": l0_info.get("total_files", 0),
                    "usage_percent": l0_info.get("usage_percent", 0)
                }
            except Exception as e:
                health_status["layers"]["l0"] = {
                    "status": "error",
                    "error": str(e)
                }
                health_status["overall_status"] = "degraded"

        # Check L1
        if self.l1:
            try:
                l1_info = self.l1.get_cache_info()
                health_status["layers"]["l1"] = {
                    "status": "healthy",
                    "storage_type": "L1",
                    "total_items": l1_info.get("total_items", 0),
                    "hit_ratio": l1_info.get("hit_ratio", 0)
                }
            except Exception as e:
                health_status["layers"]["l1"] = {
                    "status": "error",
                    "error": str(e)
                }
                health_status["overall_status"] = "degraded"

        # Check L2
        if self.l2:
            try:
                l2_info = self.l2.get_storage_info()
                health_status["layers"]["l2"] = {
                    "status": "healthy" if l2_info.get("status") == "available" else "unavailable",
                    "storage_type": "L2",
                    "total_keys": l2_info.get("total_keys", 0),
                    "connection_pool": l2_info.get("connection_pool", {})
                }
            except Exception as e:
                health_status["layers"]["l2"] = {
                    "status": "error",
                    "error": str(e)
                }
                health_status["overall_status"] = "degraded"

        # Check L3
        if self.l3:
            l3_health = self.l3.health_check()
            health_status["layers"]["l3"] = l3_health
            if l3_health.get("status") != "healthy":
                health_status["overall_status"] = "degraded"

        return health_status