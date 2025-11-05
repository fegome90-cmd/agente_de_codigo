"""
MemTech L0: Local Storage Implementation
Basic local file system storage for agent state persistence.
"""

import os
import json
import shutil
import hashlib
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime


class LocalStorage:
    """Local file system storage (L0)."""

    def __init__(self, base_path: str = ".sf", max_size_mb: int = 100):
        """
        Initialize local storage.

        Args:
            base_path: Base directory for storage
            max_size_mb: Maximum storage size in MB
        """
        self.base_path = Path(base_path)
        self.base_path.mkdir(exist_ok=True)
        self.max_size_bytes = max_size_mb * 1024 * 1024
        self.index_file = self.base_path / "index.json"

        self._load_index()

    def _load_index(self):
        """Load storage index from file."""
        if self.index_file.exists():
            try:
                with open(self.index_file, 'r') as f:
                    self.index = json.load(f)
            except Exception:
                self.index = {"created_at": datetime.now().isoformat(), "files": {}}
        else:
            self.index = {"created_at": datetime.now().isoformat(), "files": {}}

    def _save_index(self):
        """Save storage index to file."""
        with open(self.index_file, 'w') as f:
            json.dump(self.index, f, indent=2, default=str)

    def _get_file_path(self, key: str) -> Path:
        """Get file path for a key."""
        # Create hash-based filename to avoid path traversal
        safe_key = hashlib.md5(key.encode()).hexdigest()
        return self.base_path / f"{safe_key[:2]}/{safe_key[2:]}"

    def _ensure_directory(self, file_path: Path):
        """Ensure directory exists for file."""
        file_path.parent.mkdir(parents=True, exist_ok=True)

    def store(self, key: str, data: Dict[str, Any]) -> bool:
        """
        Store data in local storage.

        Args:
            key: Storage key
            data: Data to store

        Returns:
            True if successful, False otherwise
        """
        try:
            file_path = self._get_file_path(key)
            self._ensure_directory(file_path)

            # Add metadata
            storage_data = {
                "key": key,
                "data": data,
                "metadata": {
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                    "size_bytes": len(json.dumps(data, default=str).encode()),
                    "checksum": hashlib.md5(json.dumps(data, default=str).encode()).hexdigest()
                }
            }

            # Write data
            with open(file_path, 'w') as f:
                json.dump(storage_data, f, indent=2, default=str)

            # Update index
            self.index["files"][key] = {
                "path": str(file_path.relative_to(self.base_path)),
                "created_at": storage_data["metadata"]["created_at"],
                "updated_at": storage_data["metadata"]["updated_at"],
                "size_bytes": storage_data["metadata"]["size_bytes"]
            }
            self._save_index()

            # Check size limit
            self._cleanup_if_needed()

            return True

        except Exception as e:
            print(f"Error storing data for key '{key}': {e}")
            return False

    def retrieve(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve data from local storage.

        Args:
            key: Storage key

        Returns:
            Stored data or None if not found
        """
        try:
            file_path = self._get_file_path(key)
            if not file_path.exists():
                return None

            with open(file_path, 'r') as f:
                storage_data = json.load(f)

            # Verify checksum
            current_checksum = hashlib.md5(
                json.dumps(storage_data["data"], default=str).encode()
            ).hexdigest()
            if current_checksum != storage_data["metadata"]["checksum"]:
                print(f"Checksum mismatch for key '{key}'")
                return None

            return storage_data["data"]

        except Exception as e:
            print(f"Error retrieving data for key '{key}': {e}")
            return None

    def delete(self, key: str) -> bool:
        """
        Delete data from local storage.

        Args:
            key: Storage key

        Returns:
            True if successful, False otherwise
        """
        try:
            file_path = self._get_file_path(key)
            if file_path.exists():
                file_path.unlink()

            # Update index
            if key in self.index["files"]:
                del self.index["files"][key]
                self._save_index()

            return True

        except Exception as e:
            print(f"Error deleting data for key '{key}': {e}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists in storage."""
        return key in self.index["files"]

    def list_keys(self, pattern: Optional[str] = None) -> List[str]:
        """
        List all stored keys.

        Args:
            pattern: Optional pattern to filter keys

        Returns:
            List of keys
        """
        keys = list(self.index["files"].keys())
        if pattern:
            import fnmatch
            keys = [key for key in keys if fnmatch.fnmatch(key, pattern)]

        return keys

    def get_info(self, key: str) -> Optional[Dict[str, Any]]:
        """Get storage information for a key."""
        if key in self.index["files"]:
            file_info = self.index["files"][key].copy()
            file_path = self.base_path / file_info["path"]
            if file_path.exists():
                file_info["current_size_bytes"] = file_path.stat().st_size
                file_info["current_modified"] = datetime.fromtimestamp(
                    file_path.stat().st_mtime
                ).isoformat()
            return file_info
        return None

    def get_storage_info(self) -> Dict[str, Any]:
        """Get overall storage information."""
        total_files = len(self.index["files"])
        total_size = sum(info.get("size_bytes", 0) for info in self.index["files"].values())

        return {
            "storage_type": "L0",
            "base_path": str(self.base_path),
            "created_at": self.index.get("created_at"),
            "total_files": total_files,
            "total_size_bytes": total_size,
            "total_size_mb": total_size / (1024 * 1024),
            "max_size_mb": self.max_size_bytes / (1024 * 1024),
            "usage_percent": (total_size / self.max_size_bytes) * 100
        }

    def _cleanup_if_needed(self):
        """Clean up old files if storage exceeds limit."""
        if self.get_storage_info()["usage_percent"] > 90:
            # Get all files with their access times
            files_info = []
            for key, info in self.index["files"].items():
                file_path = self.base_path / info["path"]
                if file_path.exists():
                    files_info.append({
                        "key": key,
                        "path": file_path,
                        "access_time": file_path.stat().st_atime,
                        "updated_at": info["updated_at"]
                    })

            # Sort by access time (oldest first)
            files_info.sort(key=lambda x: x["access_time"])

            # Delete oldest files until under limit
            while (len(files_info) > 0 and
                   self.get_storage_info()["usage_percent"] > 80):
                oldest_file = files_info.pop(0)
                if oldest_file["path"].exists():
                    oldest_file["path"].unlink()
                    if oldest_file["key"] in self.index["files"]:
                        del self.index["files"][oldest_file["key"]]
                self._save_index()

    def clear(self) -> bool:
        """Clear all stored data."""
        try:
            if self.base_path.exists():
                shutil.rmtree(self.base_path)
            self.base_path.mkdir(exist_ok=True)
            self.index = {"created_at": datetime.now().isoformat(), "files": {}}
            self._save_index()
            return True
        except Exception as e:
            print(f"Error clearing storage: {e}")
            return False

    def backup(self, backup_path: str) -> bool:
        """Create backup of storage."""
        try:
            backup_dir = Path(backup_path)
            backup_dir.mkdir(parents=True, exist_ok=True)

            # Copy all files
            for key, info in self.index["files"].items():
                src_path = self.base_path / info["path"]
                dst_path = backup_dir / info["path"]
                dst_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dst_path)

            # Copy index
            shutil.copy2(self.index_file, backup_dir / "index.json")

            return True

        except Exception as e:
            print(f"Error creating backup: {e}")
            return False

    def restore(self, backup_path: str) -> bool:
        """Restore storage from backup."""
        try:
            backup_dir = Path(backup_path)
            if not backup_dir.exists():
                return False

            # Clear current storage
            self.clear()

            # Copy backup index
            backup_index_file = backup_dir / "index.json"
            if backup_index_file.exists():
                shutil.copy2(backup_index_file, self.index_file)

            # Copy all files
            backup_index_file = backup_dir / "index.json"
            if backup_index_file.exists():
                with open(backup_index_file, 'r') as f:
                    backup_index = json.load(f)

            for key, info in backup_index["files"].items():
                src_path = backup_dir / info["path"]
                dst_path = self.base_path / info["path"]
                dst_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dst_path)

            self._load_index()
            return True

        except Exception as e:
            print(f"Error restoring from backup: {e}")
            return False