"""
MemTech L1: Cache Storage Implementation
Fast in-memory caching with TTL support and persistence.
"""

import time
import json
import threading
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from collections import OrderedDict


class CacheStorage:
    """In-memory cache with TTL and persistence (L1)."""

    def __init__(self, base_path: str = ".sf/cache", max_items: int = 1000, default_ttl: int = 3600):
        """
        Initialize cache storage.

        Args:
            base_path: Base directory for cache persistence
            max_items: Maximum number of cached items
            default_ttl: Default TTL in seconds (1 hour)
        """
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.max_items = max_items
        self.default_ttl = default_ttl

        # In-memory cache with LRU eviction
        self.cache = OrderedDict()
        self.cache_metadata = {}
        self.lock = threading.RLock()

        # Persistence files
        self.cache_file = self.base_path / "cache.json"
        self.metadata_file = self.base_path / "metadata.json"

        # Load existing cache
        self._load_cache()

    def _load_cache(self):
        """Load cache from disk."""
        try:
            # Load cache data
            if self.cache_file.exists():
                with open(self.cache_file, 'r') as f:
                    cache_data = json.load(f)
                    # Remove expired items
                    current_time = time.time()
                    for key, (value, expiry) in cache_data.items():
                        if expiry > current_time:
                            self.cache[key] = (value, expiry)

            # Load metadata
            if self.metadata_file.exists():
                with open(self.metadata_file, 'r') as f:
                    self.cache_metadata = json.load(f)

        except Exception as e:
            print(f"Error loading cache: {e}")
            self.cache = OrderedDict()
            self.cache_metadata = {}

    def _save_cache(self):
        """Save cache to disk."""
        try:
            # Save cache data
            with open(self.cache_file, 'w') as f:
                json.dump(dict(self.cache), f, default=str)

            # Save metadata
            with open(self.metadata_file, 'w') as f:
                json.dump(self.cache_metadata, f, default=str)

        except Exception as e:
            print(f"Error saving cache: {e}")

    def _is_expired(self, key: str) -> bool:
        """Check if cache item is expired."""
        if key not in self.cache:
            return True

        _, expiry = self.cache[key]
        return time.time() > expiry

    def _evict_if_needed(self):
        """Evict items if cache is full."""
        while len(self.cache) >= self.max_items:
            # Remove oldest item (LRU)
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]
            if oldest_key in self.cache_metadata:
                del self.cache_metadata[oldest_key]

    def _cleanup_expired(self):
        """Remove expired items."""
        current_time = time.time()
        expired_keys = []

        for key, (_, expiry) in self.cache.items():
            if expiry <= current_time:
                expired_keys.append(key)

        for key in expired_keys:
            del self.cache[key]
            if key in self.cache_metadata:
                del self.cache_metadata[key]

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        Store value in cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds (uses default if None)

        Returns:
            True if successful, False otherwise
        """
        try:
            with self.lock:
                # Calculate expiry time
                ttl = ttl if ttl is not None else self.default_ttl
                expiry = time.time() + ttl

                # Remove expired items
                self._cleanup_expired()

                # Evict if needed
                self._evict_if_needed()

                # Store in cache (move to end for LRU)
                if key in self.cache:
                    del self.cache[key]
                self.cache[key] = (value, expiry)

                # Update metadata
                self.cache_metadata[key] = {
                    "created_at": datetime.now().isoformat(),
                    "expires_at": datetime.fromtimestamp(expiry).isoformat(),
                    "ttl": ttl,
                    "size_bytes": len(json.dumps(value, default=str).encode())
                }

                # Save to disk
                self._save_cache()

                return True

        except Exception as e:
            print(f"Error setting cache item '{key}': {e}")
            return False

    def get(self, key: str) -> Optional[Any]:
        """
        Retrieve value from cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        try:
            with self.lock:
                # Check if exists and not expired
                if key not in self.cache or self._is_expired(key):
                    if key in self.cache:
                        del self.cache[key]
                    if key in self.cache_metadata:
                        del self.cache_metadata[key]
                    return None

                # Move to end for LRU
                value, expiry = self.cache.pop(key)
                self.cache[key] = (value, expiry)

                return value

        except Exception as e:
            print(f"Error getting cache item '{key}': {e}")
            return None

    def delete(self, key: str) -> bool:
        """
        Delete item from cache.

        Args:
            key: Cache key

        Returns:
            True if successful, False otherwise
        """
        try:
            with self.lock:
                if key in self.cache:
                    del self.cache[key]
                if key in self.cache_metadata:
                    del self.cache_metadata[key]

                self._save_cache()
                return True

        except Exception as e:
            print(f"Error deleting cache item '{key}': {e}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists in cache and is not expired."""
        return key in self.cache and not self._is_expired(key)

    def clear(self) -> bool:
        """Clear all cached items."""
        try:
            with self.lock:
                self.cache.clear()
                self.cache_metadata.clear()
                self._save_cache()
                return True
        except Exception as e:
            print(f"Error clearing cache: {e}")
            return False

    def list_keys(self, pattern: Optional[str] = None) -> List[str]:
        """
        List all non-expired keys.

        Args:
            pattern: Optional pattern to filter keys

        Returns:
            List of keys
        """
        with self.lock:
            self._cleanup_expired()
            keys = list(self.cache.keys())

            if pattern:
                import fnmatch
                keys = [key for key in keys if fnmatch.fnmatch(key, pattern)]

            return keys

    def get_info(self, key: str) -> Optional[Dict[str, Any]]:
        """Get cache information for a key."""
        if key in self.cache_metadata and self.exists(key):
            info = self.cache_metadata[key].copy()
            value, expiry = self.cache[key]
            info["time_to_live"] = expiry - time.time()
            info["is_expired"] = self._is_expired(key)
            return info
        return None

    def get_cache_info(self) -> Dict[str, Any]:
        """Get overall cache information."""
        with self.lock:
            self._cleanup_expired()

            total_items = len(self.cache)
            total_size = sum(
                info.get("size_bytes", 0)
                for info in self.cache_metadata.values()
            )

            # Calculate hit ratio if we have stats
            hit_ratio = self.cache_metadata.get("_stats", {}).get("hit_ratio", 0)

            return {
                "storage_type": "L1",
                "base_path": str(self.base_path),
                "total_items": total_items,
                "max_items": self.max_items,
                "total_size_bytes": total_size,
                "usage_percent": (total_items / self.max_items) * 100,
                "hit_ratio": hit_ratio,
                "default_ttl": self.default_ttl,
                "eviction_policy": "LRU"
            }

    def set_many(self, items: Dict[str, Any], ttl: Optional[int] = None) -> Dict[str, bool]:
        """
        Set multiple items in cache.

        Args:
            items: Dictionary of key-value pairs
            ttl: Time to live for all items

        Returns:
            Dictionary with success status for each key
        """
        results = {}
        for key, value in items.items():
            results[key] = self.set(key, value, ttl)
        return results

    def get_many(self, keys: List[str]) -> Dict[str, Any]:
        """
        Get multiple items from cache.

        Args:
            keys: List of keys to retrieve

        Returns:
            Dictionary of found key-value pairs
        """
        results = {}
        for key in keys:
            value = self.get(key)
            if value is not None:
                results[key] = value
        return results

    def increment(self, key: str, delta: int = 1, ttl: Optional[int] = None) -> Optional[int]:
        """
        Increment a numeric cached value.

        Args:
            key: Cache key
            delta: Increment amount
            ttl: New TTL if creating key

        Returns:
            New value or None if error
        """
        try:
            with self.lock:
                current = self.get(key)
                if current is not None:
                    if isinstance(current, (int, float)):
                        new_value = current + delta
                        self.set(key, new_value)
                        return new_value
                    else:
                        raise ValueError(f"Cache value for '{key}' is not numeric")
                else:
                    # Set initial value
                    self.set(key, delta, ttl)
                    return delta

        except Exception as e:
            print(f"Error incrementing cache item '{key}': {e}")
            return None

    def touch(self, key: str, ttl: Optional[int] = None) -> bool:
        """
        Update expiry time for a cache item.

        Args:
            key: Cache key
            ttl: New TTL in seconds (uses default if None)

        Returns:
            True if successful, False otherwise
        """
        try:
            with self.lock:
                if key in self.cache and not self._is_expired(key):
                    value, _ = self.cache[key]
                    return self.set(key, value, ttl)
                return False

        except Exception as e:
            print(f"Error touching cache item '{key}': {e}")
            return False

    def cleanup(self) -> int:
        """
        Manually clean up expired items.

        Returns:
            Number of items cleaned up
        """
        with self.lock:
            initial_count = len(self.cache)
            self._cleanup_expired()
            cleaned_count = initial_count - len(self.cache)

            if cleaned_count > 0:
                self._save_cache()

            return cleaned_count