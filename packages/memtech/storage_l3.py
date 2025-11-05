"""
MemTech L3: ChromaDB Vector Storage Implementation
Advanced vector storage with semantic search capabilities.
"""

import os
import json
import uuid
import time
from typing import Dict, Any, Optional, List
from datetime import datetime
from contextlib import contextmanager

try:
    import chromadb
    from chromadb.config import Settings
    from chromadb.utils import embedding_functions

    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    print("Warning: ChromaDB not available. L3 vector storage will be disabled.")


class ChromaDBStorage:
    """ChromaDB vector storage (L3) for semantic search."""

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize ChromaDB storage.

        Args:
            config: L3 configuration dictionary
        """
        self.config = config
        self.enabled = config.get("enabled", False) and CHROMADB_AVAILABLE
        self.client = None
        self.collection = None
        self.embedding_function = None

        if self.enabled:
            self._initialize_client()

    def _initialize_client(self):
        """Initialize ChromaDB client and collection."""
        try:
            # Get configuration
            api_key = os.getenv("CHROMA_API_KEY")
            tenant = os.getenv("CHROMA_TENANT")
            database = os.getenv("CHROMA_DATABASE")
            collection_name = self.config.get("collection_name", "memtech_memory")

            # Initialize client
            if api_key and tenant and database:
                # Cloud setup
                self.client = chromadb.HttpClient(
                    host="https://api.trychroma.com",
                    ssl=True,
                    headers={
                        "X-Chroma-Token": api_key,
                        "X-Chroma-Tenant": tenant,
                        "X-Chroma-Database": database,
                    },
                )
            else:
                # Local setup
                storage_path = (
                    os.getenv("MEMTECH_MEMORY_STORAGE_PATH", os.path.abspath("./data"))
                    + "/chroma"
                )
                os.makedirs(storage_path, exist_ok=True)
                self.client = chromadb.PersistentClient(path=storage_path)

            # Initialize embedding function
            embedding_model = self.config.get("embedding_model", "default")
            if embedding_model == "openai":
                api_key = os.getenv("OPENAI_API_KEY")
                if api_key:
                    self.embedding_function = (
                        embedding_functions.OpenAIEmbeddingFunction(
                            api_key=api_key, model_name="text-embedding-3-small"
                        )
                    )
                else:
                    print("Warning: OpenAI API key not found, using default embeddings")
                    self.embedding_function = (
                        embedding_functions.DefaultEmbeddingFunction()
                    )
            else:
                self.embedding_function = embedding_functions.DefaultEmbeddingFunction()

            # Get or create collection
            try:
                self.collection = self.client.get_collection(
                    name=collection_name, embedding_function=self.embedding_function
                )
            except Exception:
                self.collection = self.client.create_collection(
                    name=collection_name,
                    embedding_function=self.embedding_function,
                    metadata={"hnsw:space": "cosine"},
                )

            print(f"✅ L3 (ChromaDB) initialized with collection: {collection_name}")

        except Exception as e:
            print(f"❌ Error initializing ChromaDB: {e}")
            self.enabled = False

    def _prepare_metadata(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare metadata for ChromaDB."""
        metadata = {
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "size_bytes": len(json.dumps(data, default=str).encode()),
            "source": "memtech_l3",
        }

        # Add custom metadata
        if "metadata" in data:
            metadata.update(data["metadata"])

        # Add tags if present
        if "tags" in data:
            metadata["tags"] = json.dumps(data["tags"])

        return metadata

    def _prepare_document(self, data: Dict[str, Any]) -> str:
        """Prepare document text for embedding."""
        if "content" in data:
            content = data["content"]
            if isinstance(content, str):
                return content
            else:
                return json.dumps(content, default=str)
        else:
            # Create text representation from data
            return json.dumps(data, default=str, ensure_ascii=False)

    def store(self, key: str, data: Dict[str, Any]) -> bool:
        """
        Store data in ChromaDB with vector embeddings.

        Args:
            key: Storage key
            data: Data to store

        Returns:
            True if successful, False otherwise
        """
        if not self.enabled or not self.collection:
            return False

        try:
            # Prepare document and metadata
            document = self._prepare_document(data)
            metadata = self._prepare_metadata(data)
            metadata["key"] = key

            # Add to collection
            self.collection.add(documents=[document], metadatas=[metadata], ids=[key])

            return True

        except Exception as e:
            print(f"Error storing data in ChromaDB for key '{key}': {e}")
            return False

    def retrieve_by_key(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve data by exact key match.

        Args:
            key: Storage key

        Returns:
            Stored data or None if not found
        """
        if not self.enabled or not self.collection:
            return None

        try:
            results = self.collection.get(ids=[key], include=["documents", "metadatas"])

            if results["ids"] and len(results["ids"]) > 0:
                # Reconstruct data
                document = results["documents"][0]
                metadata = results["metadatas"][0]

                # Parse content
                try:
                    content = json.loads(document)
                except:
                    content = document

                # Extract original data structure
                data = {
                    "content": content,
                    "metadata": {
                        k: v
                        for k, v in metadata.items()
                        if k not in ["key", "created_at", "updated_at", "source"]
                    },
                }

                # Add tags if present
                if "tags" in metadata:
                    try:
                        data["tags"] = json.loads(metadata["tags"])
                    except:
                        data["tags"] = []

                return data

            return None

        except Exception as e:
            print(f"Error retrieving data from ChromaDB for key '{key}': {e}")
            return None

    def search(
        self, query: str, limit: int = 10, tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar documents using vector similarity.

        Args:
            query: Search query
            limit: Maximum number of results
            tags: Optional tag filter

        Returns:
            List of matching documents with similarity scores
        """
        if not self.enabled or not self.collection:
            return []

        try:
            # Prepare where clause for tag filtering
            where_clause = None
            if tags:
                # This is a simplified approach - ChromaDB tag filtering can be complex
                where_clause = {"tags": {"$in": tags}}

            # Perform semantic search
            results = self.collection.query(
                query_texts=[query],
                n_results=limit,
                where=where_clause,
                include=["documents", "metadatas", "distances"],
            )

            if not results["ids"][0]:
                return []

            # Format results
            search_results = []
            for i in range(len(results["ids"][0])):
                document = results["documents"][0][i]
                metadata = results["metadatas"][0][i]
                distance = results["distances"][0][i]
                similarity = 1 - distance  # Convert distance to similarity

                # Parse content
                try:
                    content = json.loads(document)
                except:
                    content = document

                search_results.append(
                    {
                        "key": metadata.get("key"),
                        "content": content,
                        "similarity": similarity,
                        "metadata": {
                            k: v
                            for k, v in metadata.items()
                            if k not in ["key", "created_at", "updated_at", "source"]
                        },
                        "created_at": metadata.get("created_at"),
                        "score": similarity,
                    }
                )

            return search_results

        except Exception as e:
            print(f"Error searching ChromaDB: {e}")
            return []

    def delete(self, key: str) -> bool:
        """
        Delete data from ChromaDB.

        Args:
            key: Storage key

        Returns:
            True if successful, False otherwise
        """
        if not self.enabled or not self.collection:
            return False

        try:
            self.collection.delete(ids=[key])
            return True

        except Exception as e:
            print(f"Error deleting data from ChromaDB for key '{key}': {e}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists in ChromaDB."""
        if not self.enabled or not self.collection:
            return False

        try:
            results = self.collection.get(ids=[key])
            return results["ids"] and len(results["ids"]) > 0

        except Exception as e:
            print(f"Error checking existence for key '{key}': {e}")
            return False

    def list_keys(self, limit: Optional[int] = None) -> List[str]:
        """List all keys in ChromaDB."""
        if not self.enabled or not self.collection:
            return []

        try:
            results = self.collection.get(limit=limit)
            return results.get("ids", [])

        except Exception as e:
            print(f"Error listing keys: {e}")
            return []

    def get_collection_info(self) -> Dict[str, Any]:
        """Get information about the ChromaDB collection."""
        if not self.enabled:
            return {
                "storage_type": "L3",
                "status": "disabled",
                "message": "ChromaDB not available or disabled",
            }

        try:
            count = self.collection.count()
            return {
                "storage_type": "L3",
                "status": "available",
                "collection_name": self.config.get("collection_name", "memtech_memory"),
                "total_documents": count,
                "embedding_model": self.config.get("embedding_model", "default"),
                "vector_dimension": self.config.get("vector_dimension", 384),
            }

        except Exception as e:
            return {"storage_type": "L3", "status": "error", "error": str(e)}

    def clear(self) -> bool:
        """Clear all documents from the collection."""
        if not self.enabled or not self.collection:
            return False

        try:
            # Get all IDs and delete them
            results = self.collection.get()
            if results["ids"]:
                self.collection.delete(ids=results["ids"])
            return True

        except Exception as e:
            print(f"Error clearing ChromaDB collection: {e}")
            return False

    def health_check(self) -> Dict[str, Any]:
        """Perform health check on ChromaDB connection."""
        if not self.enabled:
            return {"status": "disabled", "message": "L3 storage is disabled"}

        try:
            # Try to get collection count
            count = self.collection.count()
            return {
                "status": "healthy",
                "collection_accessible": True,
                "document_count": count,
                "message": "ChromaDB is accessible and responsive",
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "collection_accessible": False,
                "error": str(e),
                "message": "ChromaDB is not accessible",
            }

    def close(self):
        """Close ChromaDB connection."""
        # ChromaDB doesn't require explicit closing for HTTP clients
        self.client = None
        self.collection = None
        print("L3 (ChromaDB) connection closed")
