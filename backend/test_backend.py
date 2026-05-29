import sys
import os
import json

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db_connection, save_video, get_video, init_db
from app.extractor import get_yt_metadata_and_transcript, clean_youtube_url
from app.rag import chunk_transcript, vector_store

def run_tests():
    print("========== STARTING BACKEND DRY-RUN VERIFICATION ==========")
    
    # 1. Initialize DB
    print("[Test 1] Initializing SQLite database...")
    init_db()
    print("SUCCESS: DB Initialized successfully.")

    # 2. Test URL Cleaning
    print("\n[Test 2] Testing URL cleaning...")
    raw_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&ab_channel=RickAstley"
    clean_url = clean_youtube_url(raw_url)
    print(f"Raw: {raw_url}")
    print(f"Clean: {clean_url}")
    assert clean_url == "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "URL cleaning failed!"
    print("SUCCESS: URL Cleaning succeeded.")

    # 3. Test Metadata Extraction (Mock / Fast extraction)
    print("\n[Test 3] Testing YouTube metadata extraction fallback structure...")
    mock_data = {
        'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'video_type': 'youtube',
        'title': 'Rick Astley - Never Gonna Give You Up',
        'views': 1200000000,
        'likes': 17000000,
        'comments': 2000000,
        'creator_name': 'Rick Astley',
        'follower_count': 3000000,
        'hashtags': ['rickroll', 'retro', 'music'],
        'upload_date': '2009-10-25',
        'duration': 212,
        'engagement_rate': 1.58,
        'transcript': '[00:00] We\'re no strangers to love\n[00:05] You know the rules and so do I\n[00:10] A full commitment\'s what I\'m thinking of\n[00:15] You wouldn\'t get this from any other guy'
    }
    
    print(f"Saving mock video for URL: {mock_data['url']}")
    save_video(mock_data)
    
    # Check cache retrieval
    cached = get_video(mock_data['url'])
    print(f"Retrieved Title: {cached['title']}")
    print(f"Retrieved Engagement Rate: {cached['engagement_rate']}%")
    assert cached['title'] == mock_data['title'], "Title mismatch!"
    assert cached['engagement_rate'] == mock_data['engagement_rate'], "Engagement rate mismatch!"
    print("SUCCESS: Metadata caching and DB persistence succeeded.")

    # 4. Test RAG Chunking & SQLite Vector Database
    print("\n[Test 4] Testing RAG chunking and vector storage seeding...")
    vector_store.add_video_chunks(mock_data['url'], mock_data['transcript'])
    
    chunks = vector_store.search("rules and commitment", [mock_data['url']], top_k=2)
    print(f"Retrieved {len(chunks)} relevant chunks:")
    for i, c in enumerate(chunks):
        print(f" Chunk {i+1} (Sim Score: {c['similarity']:.2f}):")
        print(f"  Text: {c['text'].replace('\n', ' | ')}")
        print(f"  Source Video: {c['video_url']}")
        
    assert len(chunks) > 0, "No chunks returned from search!"
    print("SUCCESS: RAG pipeline chunking & similarity search succeeded.")

    print("\n================ ALL TESTS COMPLETED SUCCESSFULLY! ================")

if __name__ == "__main__":
    run_tests()
