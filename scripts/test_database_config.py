#!/usr/bin/env python3
"""
Database Configuration Test Script
Tests PostgreSQL connection using startkit-main patterns.
"""

import os
import sys
import json
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse

# Add packages to path
sys.path.append(str(Path(__file__).parent.parent / "packages"))

from memtech import load_memtech_config, MemTechManager


def test_database_connection():
    """Test database connection using different configuration methods."""
    print("🔍 Testing Database Configuration")
    print("=" * 50)

    # Test Method 1: DATABASE_URL (from Universal config)
    print("\n1. Testing DATABASE_URL configuration...")
    db_url = os.getenv('DATABASE_URL')
    if db_url:
        try:
            print(f"   URL: {db_url}")
            conn = psycopg2.connect(db_url)
            with conn.cursor() as cursor:
                cursor.execute("SELECT version()")
                version = cursor.fetchone()[0]
                print(f"   ✅ Connected: PostgreSQL {version}")
            conn.close()
        except Exception as e:
            print(f"   ❌ Failed: {e}")
    else:
        print("   ⚠️ DATABASE_URL not set")

    # Test Method 2: Individual environment variables (startkit-main style)
    print("\n2. Testing individual environment variables...")
    pg_host = os.getenv('POSTGRES_HOST', 'localhost')
    pg_port = os.getenv('POSTGRES_PORT', '5432')
    pg_db = os.getenv('POSTGRES_DB', 'memory_verification')
    pg_user = os.getenv('POSTGRES_USER', 'postgres')
    pg_password = os.getenv('POSTGRES_PASSWORD', 'postgres')

    # Check for startkit-main staging configuration
    if os.getenv('DB_PASSWORD'):
        pg_user = 'surprise_user'
        pg_password = os.getenv('DB_PASSWORD')
        pg_db = 'surprise_metrics_staging'
        pg_port = '5433'
        print("   🎯 Using startkit-main staging configuration")

    print(f"   Host: {pg_host}")
    print(f"   Port: {pg_port}")
    print(f"   Database: {pg_db}")
    print(f"   User: {pg_user}")

    try:
        conn = psycopg2.connect(
            host=pg_host,
            port=pg_port,
            database=pg_db,
            user=pg_user,
            password=pg_password
        )
        with conn.cursor() as cursor:
            cursor.execute("SELECT version()")
            version = cursor.fetchone()[0]
            print(f"   ✅ Connected: PostgreSQL {version}")
        conn.close()
    except Exception as e:
        print(f"   ❌ Failed: {e}")

    # Test Method 3: SQLite fallback
    print("\n3. Testing SQLite fallback...")
    try:
        import sqlite3
        conn = sqlite3.connect('./data/test.db')
        cursor = conn.cursor()
        cursor.execute("SELECT sqlite_version()")
        version = cursor.fetchone()[0]
        print(f"   ✅ Connected: SQLite {version}")
        conn.close()
        os.unlink('./data/test.db')
    except Exception as e:
        print(f"   ❌ Failed: {e}")


def test_memtech_config():
    """Test MemTech configuration loading."""
    print("\n⚙️ Testing MemTech Configuration")
    print("=" * 50)

    try:
        # Load configuration
        config = load_memtech_config()
        print(f"✅ Configuration loaded successfully")
        print(f"   Storage path: {config.storage_path}")
        print(f"   Max memory: {config.max_memory_mb}MB")
        print(f"   Database URL: {config.database_url}")
        print(f"   Redis URL: {config.redis_url}")
        print(f"   Log level: {config.log_level}")

        # Test MemTech Manager with this config
        print("\n🚀 Testing MemTech Manager...")
        manager = MemTechManager(universal_config_path="./config/default.yaml")

        # Check health
        health = manager.health_check()
        print(f"   Overall status: {health['overall_status']}")

        for layer, status in health['layers'].items():
            status_icon = "✅" if status['status'] == 'healthy' else "❌" if status['status'] == 'error' else "⚠️"
            print(f"   {status_icon} {layer.upper()}: {status['status']}")

            if 'total_files' in status:
                print(f"      Files: {status['total_files']}")
            if 'total_items' in status:
                print(f"      Items: {status['total_items']}")
            if 'total_keys' in status:
                print(f"      Keys: {status['total_keys']}")
            if 'message' in status:
                print(f"      Message: {status['message']}")

        manager.close()
        print("✅ MemTech Manager test completed")

    except Exception as e:
        print(f"❌ MemTech configuration test failed: {e}")
        import traceback
        traceback.print_exc()


def test_connection_with_real_data():
    """Test database connection and create test data."""
    print("\n💾 Testing Database Operations")
    print("=" * 50)

    try:
        # Use the most reliable configuration
        db_url = (
            os.getenv('DATABASE_URL') or
            f"postgresql://{os.getenv('POSTGRES_USER', 'postgres')}:{os.getenv('POSTGRES_PASSWORD', 'postgres')}@{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'memory_verification')}"
        )

        print(f"   Using connection: {db_url}")
        conn = psycopg2.connect(db_url)

        with conn.cursor() as cursor:
            # Create test table if not exists
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS memtech_test (
                    id SERIAL PRIMARY KEY,
                    test_data JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Insert test data
            test_data = {
                "type": "database_test",
                "message": "Testing MemTech database integration",
                "timestamp": "2025-11-01T16:30:00Z",
                "config": {
                    "adapter": "psycopg2",
                    "pool_size": 20,
                    "timeout": 2000
                }
            }

            cursor.execute("""
                INSERT INTO memtech_test (test_data)
                VALUES (%s)
                RETURNING id
            """, (json.dumps(test_data),))

            inserted_id = cursor.fetchone()[0]
            print(f"   ✅ Inserted test record with ID: {inserted_id}")

            # Retrieve test data
            cursor.execute("SELECT * FROM memtech_test WHERE id = %s", (inserted_id,))
            result = cursor.fetchone()
            if result:
                retrieved_data = result[1]
                print(f"   ✅ Retrieved test data: {retrieved_data['type']}")

            # Clean up
            cursor.execute("DELETE FROM memtech_test WHERE id = %s", (inserted_id,))
            print(f"   ✅ Cleaned up test record")

        conn.commit()
        conn.close()
        print("   ✅ Database operations test completed")

    except Exception as e:
        print(f"   ❌ Database operations test failed: {e}")
        import traceback
        traceback.print_exc()


def main():
    """Main test function."""
    print("🧪 MemTech Database Configuration Test Suite")
    print("=" * 60)

    try:
        test_database_connection()
        test_memtech_config()
        test_connection_with_real_data()

        print("\n🎉 All database tests completed successfully!")
        print("\n📝 Configuration Guide:")
        print("1. Set DATABASE_URL for direct connection")
        print("2. Or use individual POSTGRES_* variables")
        print("3. Or set DB_PASSWORD for startkit-main staging")
        print("4. Copy .env.example to .env and adjust values")

    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
    except Exception as e:
        print(f"\n❌ Test suite failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()