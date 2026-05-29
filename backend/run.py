import uvicorn
import os

if __name__ == "__main__":
    # Read the PORT environment variable injected by the cloud host, fallback to 8000
    port = int(os.environ.get("PORT", 8000))
    print(f"[Server] Launching FastAPI backend service on port {port}")
    
    # Disable hot-reload in production (port != 8000) to save critical memory resources
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True if port == 8000 else False)
