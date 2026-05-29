import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Video Intelligence RAG Chatbot"
    DATABASE_URL: str = "sqlite:///./videos.db"
    OPENAI_API_KEY: str = ""
    
    # Models
    LLM_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    
    # RAG Settings
    CHUNK_SIZE: int = 300
    CHUNK_OVERLAP: int = 40
    
    # Vector DB Mode: 'sqlite' or 'chroma' or 'pgvector'
    VECTOR_DB_MODE: str = "sqlite"

    class Config:
        env_file = ".env"
        extra = "ignore"

# Instantiate settings
settings = Settings()

# Ensure database directory exists
db_path = settings.DATABASE_URL.replace("sqlite:///", "")
if db_path and not db_path.startswith(":memory:") and "/" in db_path:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
