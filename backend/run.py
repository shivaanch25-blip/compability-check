import uvicorn
import os

if __name__ == "__main__":
    # Start the FastAPI application on port 8000
    print("[Server] Launching FastAPI backend service on http://localhost:8000")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
