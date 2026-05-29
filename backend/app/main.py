import os
import uuid
import json
import logging
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.database import (
    get_video, save_video, create_task, update_task, get_task, get_db_connection
)
from app.extractor import (
    get_youtube_video_id, get_yt_metadata_and_transcript, 
    get_instagram_metadata_and_transcript
)
from app.rag import vector_store, stream_rag_chat

logger = logging.getLogger("main")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title=settings.APP_NAME)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class VideoUploadRequest(BaseModel):
    video_a_url: str
    video_b_url: str

class ChatMessage(BaseModel):
    role: str # 'user' or 'assistant'
    content: str

class ChatRequest(BaseModel):
    query: str
    video_a_url: str
    video_b_url: str
    history: List[ChatMessage] = []

# ==========================================
# Background Processing Worker Task
# ==========================================
def process_videos_task(task_id: str, video_a_url: str, video_b_url: str):
    logger.info(f"Background task {task_id} started. Processing URL A: {video_a_url} & URL B: {video_b_url}")
    update_task(task_id, "processing")
    
    try:
        # 1. Process Video A (YouTube)
        video_a = get_video(video_a_url)
        if not video_a:
            logger.info(f"Video A cache miss. Extracting and embedding...")
            video_a = get_yt_metadata_and_transcript(video_a_url)
            save_video(video_a)
            # Seed vector db
            vector_store.add_video_chunks(video_a_url, video_a['transcript'])
        else:
            logger.info("Video A loaded from persistent SQLite cache.")
            
        # 2. Process Video B (Instagram Reel)
        video_b = get_video(video_b_url)
        if not video_b:
            logger.info(f"Video B cache miss. Extracting and embedding...")
            video_b = get_instagram_metadata_and_transcript(video_b_url)
            save_video(video_b)
            # Seed vector db
            vector_store.add_video_chunks(video_b_url, video_b['transcript'])
        else:
            logger.info("Video B loaded from persistent SQLite cache.")
            
        result = {
            "video_a": {
                "url": video_a["url"],
                "video_type": video_a["video_type"],
                "title": video_a["title"],
                "views": video_a["views"],
                "likes": video_a["likes"],
                "comments": video_a["comments"],
                "creator_name": video_a["creator_name"],
                "follower_count": video_a["follower_count"],
                "hashtags": video_a["hashtags"],
                "upload_date": video_a["upload_date"],
                "duration": video_a["duration"],
                "engagement_rate": video_a["engagement_rate"],
            },
            "video_b": {
                "url": video_b["url"],
                "video_type": video_b["video_type"],
                "title": video_b["title"],
                "views": video_b["views"],
                "likes": video_b["likes"],
                "comments": video_b["comments"],
                "creator_name": video_b["creator_name"],
                "follower_count": video_b["follower_count"],
                "hashtags": video_b["hashtags"],
                "upload_date": video_b["upload_date"],
                "duration": video_b["duration"],
                "engagement_rate": video_b["engagement_rate"],
            }
        }
        
        update_task(task_id, "completed", result=result)
        logger.info(f"Background task {task_id} completed successfully.")
        
    except Exception as e:
        logger.error(f"Background task {task_id} failed: {str(e)}", exc_info=True)
        update_task(task_id, "failed", error_message=str(e))

# ==========================================
# REST API Endpoints
# ==========================================
@app.get("/api/health")
def health_check():
    return {"status": "healthy", "settings": {"vector_db": settings.VECTOR_DB_MODE, "llm": settings.LLM_MODEL}}

@app.post("/api/upload-videos")
def upload_videos(payload: VideoUploadRequest, background_tasks: BackgroundTasks):
    video_a_url = payload.video_a_url.strip()
    video_b_url = payload.video_b_url.strip()
    
    if not video_a_url or not video_b_url:
        raise HTTPException(status_code=400, detail="Both video URLs are required.")
        
    # Check cache first - if both videos are already analyzed, return instant completed task
    video_a = get_video(video_a_url)
    video_b = get_video(video_b_url)
    
    if video_a and video_b:
        task_id = f"cached_{uuid.uuid4().hex[:8]}"
        logger.info("Both videos hit SQLite cache. Returning immediate completed task.")
        result = {
            "video_a": video_a,
            "video_b": video_b
        }
        # Save pre-completed task in DB for polling compatibility
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO tasks (task_id, status, video_a_url, video_b_url, result)
        VALUES (?, 'completed', ?, ?, ?)
        """, (task_id, video_a_url, video_b_url, json.dumps(result)))
        conn.commit()
        conn.close()
        
        return {"task_id": task_id, "status": "completed", "cached": True}
        
    # Trigger background ingestion
    task_id = str(uuid.uuid4())
    create_task(task_id, video_a_url, video_b_url)
    background_tasks.add_task(process_videos_task, task_id, video_a_url, video_b_url)
    
    return {"task_id": task_id, "status": "pending"}

@app.get("/api/tasks/{task_id}")
def check_task_status(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task

@app.get("/api/videos/compare")
def compare_cached_videos(url_a: str = Query(...), url_b: str = Query(...)):
    video_a = get_video(url_a.strip())
    video_b = get_video(url_b.strip())
    
    if not video_a or not video_b:
        raise HTTPException(status_code=404, detail="One or both videos have not been processed yet.")
        
    return {
        "video_a": video_a,
        "video_b": video_b
    }

@app.post("/api/chat/stream")
async def chat_streaming_endpoint(payload: ChatRequest):
    video_a_url = payload.video_a_url.strip()
    video_b_url = payload.video_b_url.strip()
    
    video_a = get_video(video_a_url)
    video_b = get_video(video_b_url)
    
    if not video_a or not video_b:
        raise HTTPException(status_code=400, detail="Videos must be uploaded and processed before starting chat.")
        
    history_list = [{"role": msg.role, "content": msg.content} for msg in payload.history]
    
    def event_generator():
        # Yield initial connection confirmation
        yield {"event": "info", "data": json.dumps({"status": "connected"})}
        
        try:
            for text_chunk in stream_rag_chat(payload.query, history_list, video_a, video_b):
                yield {"event": "chunk", "data": json.dumps({"text": text_chunk})}
        except Exception as e:
            logger.error(f"Error streaming chat: {str(e)}", exc_info=True)
            yield {"event": "error", "data": json.dumps({"detail": str(e)})}
            
        yield {"event": "done", "data": json.dumps({"status": "finished"})}

    return EventSourceResponse(event_generator())

# Direct bootloader
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
