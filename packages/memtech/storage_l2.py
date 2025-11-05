"""
MemTech L2: PostgreSQL Storage Implementation
Persistent database storage for agent state.
"""

import os
import json
import hashlib
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from contextlib import contextmanager


class PostgreSQLStorage:
    """PostgreSQL storage (L2)."""

    def __init__(self, connection_string: Optional[str] = None, **kwargs):
        """
        Initialize PostgreSQL storage.

        Args:
            connection_string: PostgreSQL connection string
            **kwargs: Alternative connection parameters
        """
        self.connection_string = (
            connection_string or
            os.getenv('DATABASE_URL') or
            f"postgresql://{kwargs.get('user', 'sf_user')}:{kwargs.get('password', 'sf_pass')}@{kwargs.get('host', '127.0.0.1')}:{kwargs.get('port', 5432)}/{kwargs.get('database', 'sf_db')}"
        )

        self.pool = None
        self._initialize_connection()

    def _initialize_connection(self):
        """Initialize database connection and create tables."""
        try:
            # Try to import psycopg2
            import psycopg2
            from psycopg2 import pool
            from psycopg2.extras import RealDictCursor

            # Create connection pool
            self.pool = psycopg2.pool.SimpleConnectionPool(
                1, 10,  # min and max connections
                self.connection_string
            )

            # Create tables if they don't exist
            self._create_tables()

        except ImportError:
            print("Warning: psycopg2 not available. PostgreSQL storage will be disabled.")
            self.pool = None
        except Exception as e:
            print(f"Error initializing PostgreSQL connection: {e}")
            self.pool = None

    @contextmanager
    def _get_connection(self):
        """Get database connection from pool."""
        if not self.pool:
            raise RuntimeError("PostgreSQL pool not available")

        conn = None
        try:
            conn = self.pool.getconn()
            yield conn
        finally:
            if conn:
                self.pool.putconn(conn)

    def _create_tables(self):
        """Create necessary database tables."""
        create_tables_sql = """
        CREATE TABLE IF NOT EXISTS memtech_storage (
            id SERIAL PRIMARY KEY,
            key VARCHAR(255) UNIQUE NOT NULL,
            data JSONB NOT NULL,
            metadata JSONB,
            checksum VARCHAR(64),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE,
            size_bytes INTEGER,
            version INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS memtech_index (
            key VARCHAR(255) PRIMARY KEY,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            access_count INTEGER DEFAULT 0,
            size_bytes INTEGER DEFAULT 0,
            tags JSONB DEFAULT '[]'::jsonb
        );

        CREATE TABLE IF NOT EXISTS memtech_events (
            id SERIAL PRIMARY KEY,
            event_type VARCHAR(50) NOT NULL,
            key VARCHAR(255),
            details JSONB,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_memtech_storage_key ON memtech_storage(key);
        CREATE INDEX IF NOT EXISTS idx_memtech_storage_expires ON memtech_storage(expires_at);
        CREATE INDEX IF NOT EXISTS idx_memtech_storage_created ON memtech_storage(created_at);
        CREATE INDEX IF NOT EXISTS idx_memtech_index_last_accessed ON memtech_index(last_accessed);
        CREATE INDEX IF NOT EXISTS idx_memtech_events_timestamp ON memtech_events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_memtech_events_key ON memtech_events(key);
        """

        with self._get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(create_tables_sql)
                conn.commit()

    def _calculate_checksum(self, data: Dict[str, Any]) -> str:
        """Calculate checksum for data integrity."""
        data_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(data_str.encode()).hexdigest()

    def store(self, key: str, data: Dict[str, Any], ttl: Optional[int] = None,
              tags: Optional[List[str]] = None) -> bool:
        """
        Store data in PostgreSQL.

        Args:
            key: Storage key
            data: Data to store
            ttl: Time to live in seconds
            tags: Optional tags for categorization

        Returns:
            True if successful, False otherwise
        """
        if not self.pool:
            return False

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    # Prepare data and metadata
                    checksum = self._calculate_checksum(data)
                    data_json = json.dumps(data, default=str)
                    size_bytes = len(data_json.encode())

                    expires_at = None
                    if ttl:
                        expires_at = datetime.utcnow() + timedelta(seconds=ttl)

                    metadata = {
                        "size_bytes": size_bytes,
                        "checksum": checksum,
                        "tags": tags or []
                    }

                    # Upsert operation
                    cursor.execute("""
                        INSERT INTO memtech_storage (key, data, metadata, checksum, expires_at, size_bytes)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (key) DO UPDATE SET
                            data = EXCLUDED.data,
                            metadata = EXCLUDED.metadata,
                            checksum = EXCLUDED.checksum,
                            expires_at = EXCLUDED.expires_at,
                            size_bytes = EXCLUDED.size_bytes,
                            updated_at = NOW(),
                            version = memtech_storage.version + 1
                        RETURNING version
                    """, (key, data_json, json.dumps(metadata), checksum, expires_at, size_bytes))

                    # Update index
                    cursor.execute("""
                        INSERT INTO memtech_index (key, size_bytes, tags)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (key) DO UPDATE SET
                            last_accessed = NOW(),
                            access_count = memtech_index.access_count + 1,
                            size_bytes = EXCLUDED.size_bytes,
                            tags = EXCLUDED.tags
                    """, (key, size_bytes, tags or []))

                    # Log event
                    cursor.execute("""
                        INSERT INTO memtech_events (event_type, key, details)
                        VALUES (%s, %s, %s)
                    """, ("store", key, {"size_bytes": size_bytes, "ttl": ttl}))

                    conn.commit()
                    return True

        except Exception as e:
            print(f"Error storing data for key '{key}': {e}")
            return False

    def retrieve(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve data from PostgreSQL.

        Args:
            key: Storage key

        Returns:
            Stored data or None if not found
        """
        if not self.pool:
            return None

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    # Check if exists and not expired
                    cursor.execute("""
                        SELECT data, checksum, expires_at
                        FROM memtech_storage
                        WHERE key = %s AND (expires_at IS NULL OR expires_at > NOW())
                    """, (key,))

                    result = cursor.fetchone()
                    if not result:
                        return None

                    data_json, stored_checksum, expires_at = result

                    # Verify checksum
                    calculated_checksum = hashlib.sha256(data_json.encode()).hexdigest()
                    if calculated_checksum != stored_checksum:
                        print(f"Checksum mismatch for key '{key}'")
                        return None

                    # Update access info
                    cursor.execute("""
                        UPDATE memtech_index
                        SET last_accessed = NOW(), access_count = access_count + 1
                        WHERE key = %s
                    """, (key,))

                    # Log access event
                    cursor.execute("""
                        INSERT INTO memtech_events (event_type, key, details)
                        VALUES (%s, %s, %s)
                    """, ("access", key, {"expires_at": expires_at.isoformat() if expires_at else None}))

                    conn.commit()

                    return json.loads(data_json)

        except Exception as e:
            print(f"Error retrieving data for key '{key}': {e}")
            return None

    def delete(self, key: str) -> bool:
        """
        Delete data from PostgreSQL.

        Args:
            key: Storage key

        Returns:
            True if successful, False otherwise
        """
        if not self.pool:
            return False

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    # Delete from storage
                    cursor.execute("DELETE FROM memtech_storage WHERE key = %s", (key,))
                    deleted_count = cursor.rowcount

                    # Delete from index
                    cursor.execute("DELETE FROM memtech_index WHERE key = %s", (key,))

                    # Log deletion event
                    if deleted_count > 0:
                        cursor.execute("""
                            INSERT INTO memtech_events (event_type, key, details)
                            VALUES (%s, %s, %s)
                        """, ("delete", key, {"deleted_count": deleted_count}))

                    conn.commit()
                    return deleted_count > 0

        except Exception as e:
            print(f"Error deleting data for key '{key}': {e}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists in storage and is not expired."""
        if not self.pool:
            return False

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT 1 FROM memtech_storage
                        WHERE key = %s AND (expires_at IS NULL OR expires_at > NOW())
                        LIMIT 1
                    """, (key,))
                    return cursor.fetchone() is not None

        except Exception as e:
            print(f"Error checking existence for key '{key}': {e}")
            return False

    def list_keys(self, pattern: Optional[str] = None, limit: Optional[int] = None) -> List[str]:
        """
        List stored keys.

        Args:
            pattern: Optional pattern to filter keys
            limit: Maximum number of keys to return

        Returns:
            List of keys
        """
        if not self.pool:
            return []

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    query = """
                        SELECT key FROM memtech_storage
                        WHERE expires_at IS NULL OR expires_at > NOW()
                    """
                    params = []

                    if pattern:
                        query += " AND key LIKE %s"
                        params.append(pattern)

                    query += " ORDER BY updated_at DESC"

                    if limit:
                        query += " LIMIT %s"
                        params.append(limit)

                    cursor.execute(query, params)
                    results = cursor.fetchall()
                    return [row[0] for row in results]

        except Exception as e:
            print(f"Error listing keys: {e}")
            return []

    def get_info(self, key: str) -> Optional[Dict[str, Any]]:
        """Get storage information for a key."""
        if not self.pool:
            return None

        try:
            with self._get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT s.created_at, s.updated_at, s.expires_at, s.size_bytes,
                               s.version, i.access_count, i.last_accessed, s.metadata
                        FROM memtech_storage s
                        LEFT JOIN memtech_index i ON s.key = i.key
                        WHERE s.key = %s
                    """, (key,))

                    result = cursor.fetchone()
                    if result:
                        return dict(result)
                    return None

        except Exception as e:
            print(f"Error getting info for key '{key}': {e}")
            return None

    def get_storage_info(self) -> Dict[str, Any]:
        """Get overall storage information."""
        if not self.pool:
            return {"storage_type": "L2", "status": "unavailable"}

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    # Get storage statistics
                    cursor.execute("""
                        SELECT
                            COUNT(*) as total_keys,
                            COALESCE(SUM(size_bytes), 0) as total_size_bytes,
                            COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 END) as expired_keys,
                            COUNT(CASE WHEN expires_at IS NULL OR expires_at > NOW() THEN 1 END) as active_keys,
                            MIN(created_at) as oldest_created,
                            MAX(updated_at) as latest_updated
                        FROM memtech_storage
                    """)

                    stats = cursor.fetchone()

                    # Get connection pool info
                    pool_info = {
                        "min_connections": self.pool.minconn,
                        "max_connections": self.pool.maxconn,
                        "closed_connections": getattr(self.pool, 'closed', False)
                    }

                    return {
                        "storage_type": "L2",
                        "total_keys": stats[0] or 0,
                        "total_size_bytes": stats[1] or 0,
                        "total_size_mb": (stats[1] or 0) / (1024 * 1024),
                        "active_keys": stats[3] or 0,
                        "expired_keys": stats[2] or 0,
                        "oldest_created": stats[4].isoformat() if stats[4] else None,
                        "latest_updated": stats[5].isoformat() if stats[5] else None,
                        "connection_pool": pool_info,
                        "status": "available"
                    }

        except Exception as e:
            print(f"Error getting storage info: {e}")
            return {"storage_type": "L2", "status": "error", "error": str(e)}

    def cleanup_expired(self, batch_size: int = 1000) -> int:
        """
        Clean up expired items.

        Args:
            batch_size: Number of items to delete per batch

        Returns:
            Number of items cleaned up
        """
        if not self.pool:
            return 0

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    # Get expired keys
                    cursor.execute("""
                        SELECT key FROM memtech_storage
                        WHERE expires_at IS NOT NULL AND expires_at <= NOW()
                        LIMIT %s
                    """, (batch_size,))

                    expired_keys = [row[0] for row in cursor.fetchall()]

                    if not expired_keys:
                        return 0

                    # Delete expired items
                    placeholders = ','.join(['%s'] * len(expired_keys))
                    cursor.execute(f"""
                        DELETE FROM memtech_storage
                        WHERE key IN ({placeholders})
                    """, expired_keys)

                    cursor.execute(f"""
                        DELETE FROM memtech_index
                        WHERE key IN ({placeholders})
                    """, expired_keys)

                    # Log cleanup event
                    cursor.execute("""
                        INSERT INTO memtech_events (event_type, key, details)
                        VALUES (%s, %s, %s)
                    """, ("cleanup", "batch", {"deleted_keys": len(expired_keys)}))

                    conn.commit()
                    return len(expired_keys)

        except Exception as e:
            print(f"Error during cleanup: {e}")
            return 0

    def vacuum(self) -> bool:
        """Run VACUUM to reclaim storage space."""
        if not self.pool:
            return False

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("VACUUM ANALYZE memtech_storage")
                    cursor.execute("VACUUM ANALYZE memtech_index")
                    cursor.execute("VACUUM ANALYZE memtech_events")
                    conn.commit()
                    return True

        except Exception as e:
            print(f"Error running vacuum: {e}")
            return False

    def search_by_tags(self, tags: List[str], operator: str = "AND") -> List[str]:
        """
        Search keys by tags.

        Args:
            tags: List of tags to search for
            operator: "AND" or "OR" for tag combination

        Returns:
            List of matching keys
        """
        if not self.pool or not tags:
            return []

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    if operator.upper() == "AND":
                        # All tags must be present
                        query = """
                            SELECT DISTINCT s.key FROM memtech_storage s
                            JOIN memtech_index i ON s.key = i.key
                            WHERE (s.expires_at IS NULL OR s.expires_at > NOW())
                            AND i.tags @> %s::jsonb
                        """
                        params = [json.dumps(tags)]
                    else:
                        # Any tag can be present (OR)
                        query = """
                            SELECT DISTINCT s.key FROM memtech_storage s
                            JOIN memtech_index i ON s.key = i.key
                            WHERE (s.expires_at IS NULL OR s.expires_at > NOW())
                            AND EXISTS (
                                SELECT 1 FROM jsonb_array_elements(i.tags) tag
                                WHERE tag::text IN %s
                            )
                        """
                        params = [(tag for tag in tags)]

                    cursor.execute(query, params)
                    results = cursor.fetchall()
                    return [row[0] for row in results]

        except Exception as e:
            print(f"Error searching by tags: {e}")
            return []

    def close(self):
        """Close database connection pool."""
        if self.pool:
            self.pool.closeall()
            self.pool = None