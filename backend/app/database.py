import sqlite3
import json
import os
from typing import Dict, Any, Optional, List
from datetime import datetime
from app.config import settings

DB_FILE = settings.DATABASE_URL.replace("sqlite:///", "")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Videos Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS videos (
        url TEXT PRIMARY KEY,
        video_type TEXT NOT NULL,
        title TEXT,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        creator_name TEXT,
        follower_count INTEGER DEFAULT 0,
        hashtags TEXT, -- JSON string
        upload_date TEXT,
        duration INTEGER DEFAULT 0,
        engagement_rate REAL DEFAULT 0.0,
        transcript TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Processing Tasks Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        error_message TEXT,
        video_a_url TEXT,
        video_b_url TEXT,
        result TEXT, -- JSON string of outcomes
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Vector store chunk table for RAG (NumPy vector engine)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transcript_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_url TEXT,
        chunk_index INTEGER,
        text_content TEXT,
        start_time REAL,
        end_time REAL,
        embedding BLOB, -- JSON string or raw float list serialized
        FOREIGN KEY (video_url) REFERENCES videos(url) ON DELETE CASCADE
    )
    """)
    
    conn.commit()
    conn.close()

def save_video(video_data: Dict[str, Any]):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO videos (
        url, video_type, title, views, likes, comments, creator_name, 
        follower_count, hashtags, upload_date, duration, engagement_rate, transcript
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        video_data['url'],
        video_data['video_type'],
        video_data.get('title', ''),
        video_data.get('views', 0),
        video_data.get('likes', 0),
        video_data.get('comments', 0),
        video_data.get('creator_name', 'Unknown'),
        video_data.get('follower_count', 0),
        json.dumps(video_data.get('hashtags', [])),
        video_data.get('upload_date', ''),
        video_data.get('duration', 0),
        video_data.get('engagement_rate', 0.0),
        video_data.get('transcript', '')
    ))
    conn.commit()
    conn.close()

def get_video(url: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM videos WHERE url = ?", (url,))
    row = cursor.fetchone()
    conn.close()
    if row:
        video = dict(row)
        video['hashtags'] = json.loads(video['hashtags']) if video['hashtags'] else []
        return video
    return None

def create_task(task_id: str, video_a_url: str, video_b_url: str) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO tasks (task_id, status, video_a_url, video_b_url)
    VALUES (?, 'pending', ?, ?)
    """, (task_id, video_a_url, video_b_url))
    conn.commit()
    conn.close()
    return {"task_id": task_id, "status": "pending"}

def update_task(task_id: str, status: str, error_message: Optional[str] = None, result: Optional[Dict[str, Any]] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    res_str = json.dumps(result) if result else None
    cursor.execute("""
    UPDATE tasks
    SET status = ?, error_message = ?, result = ?, updated_at = CURRENT_TIMESTAMP
    WHERE task_id = ?
    """, (status, error_message, res_str, task_id))
    conn.commit()
    conn.close()

def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks WHERE task_id = ?", (task_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        task = dict(row)
        if task['result']:
            task['result'] = json.loads(task['result'])
        return task
    return None

def save_chunks(video_url: str, chunks: List[Dict[str, Any]]):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Delete old chunks for this URL if any
    cursor.execute("DELETE FROM transcript_chunks WHERE video_url = ?", (video_url,))
    for chunk in chunks:
        cursor.execute("""
        INSERT INTO transcript_chunks (video_url, chunk_index, text_content, start_time, end_time, embedding)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            video_url,
            chunk['index'],
            chunk['text'],
            chunk.get('start_time', 0.0),
            chunk.get('end_time', 0.0),
            json.dumps(chunk['embedding'])
        ))
    conn.commit()
    conn.close()

def get_chunks_for_video(video_url: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT chunk_index, text_content, start_time, end_time, embedding FROM transcript_chunks WHERE video_url = ?", (video_url,))
    rows = cursor.fetchall()
    conn.close()
    
    chunks = []
    for r in rows:
        chunks.append({
            'index': r['chunk_index'],
            'text': r['text_content'],
            'start_time': r['start_time'],
            'end_time': r['end_time'],
            'embedding': json.loads(r['embedding']) if r['embedding'] else []
        })
    return chunks

# Initialize DB on load
init_db()
print("[Database] SQLite database initialized successfully.")
