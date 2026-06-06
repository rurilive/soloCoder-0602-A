import asyncio
import json
import uuid
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os

app = FastAPI(title="CI/CD Visual Panel API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

PROJECTS_FILE = os.path.join(DATA_DIR, "projects.json")
BUILDS_FILE = os.path.join(DATA_DIR, "builds.json")

class BuildStep(BaseModel):
    name: str
    command: str

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    steps: List[BuildStep] = []

class Project(ProjectCreate):
    id: str
    created_at: str

class BuildTrigger(BaseModel):
    project_id: str

class Build(BaseModel):
    id: str
    project_id: str
    project_name: str
    status: str
    steps: List[Dict]
    logs: List[str]
    started_at: str
    finished_at: Optional[str] = None

def load_data():
    if os.path.exists(PROJECTS_FILE):
        with open(PROJECTS_FILE, "r") as f:
            projects = json.load(f)
    else:
        projects = []
    
    if os.path.exists(BUILDS_FILE):
        with open(BUILDS_FILE, "r") as f:
            builds = json.load(f)
    else:
        builds = []
    
    return projects, builds

def save_data(projects, builds):
    with open(PROJECTS_FILE, "w") as f:
        json.dump(projects, f, indent=2)
    with open(BUILDS_FILE, "w") as f:
        json.dump(builds, f, indent=2)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, build_id: str):
        await websocket.accept()
        if build_id not in self.active_connections:
            self.active_connections[build_id] = []
        self.active_connections[build_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, build_id: str):
        if build_id in self.active_connections:
            self.active_connections[build_id].remove(websocket)
            if not self.active_connections[build_id]:
                del self.active_connections[build_id]
    
    async def broadcast(self, build_id: str, message: dict):
        if build_id in self.active_connections:
            for connection in self.active_connections[build_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass

manager = ConnectionManager()

build_tasks: Dict[str, asyncio.Task] = {}

async def simulate_build(build_id: str, project: dict):
    _, builds = load_data()
    build = next((b for b in builds if b["id"] == build_id), None)
    if not build:
        return
    
    build["status"] = "running"
    save_data(_, builds)
    
    await manager.broadcast(build_id, {"type": "status", "status": "running"})
    
    for step_idx, step in enumerate(project["steps"]):
        build["steps"][step_idx]["status"] = "running"
        save_data(_, builds)
        await manager.broadcast(build_id, {
            "type": "step_start",
            "step_index": step_idx,
            "step_name": step["name"]
        })
        
        log_lines = [
            f"$ {step['command']}",
            f"[INFO] Executing step: {step['name']}",
            "[INFO] Checking dependencies...",
            "[INFO] Downloading packages...",
            "[INFO] Compiling source code...",
            "[INFO] Running tests...",
            f"[SUCCESS] Step '{step['name']}' completed successfully"
        ]
        
        for line in log_lines:
            build["logs"].append(line)
            save_data(_, builds)
            await manager.broadcast(build_id, {"type": "log", "line": line})
            await asyncio.sleep(0.5)
        
        build["steps"][step_idx]["status"] = "success"
        save_data(_, builds)
        await manager.broadcast(build_id, {
            "type": "step_end",
            "step_index": step_idx,
            "status": "success"
        })
    
    build["status"] = "success"
    build["finished_at"] = datetime.now().isoformat()
    save_data(_, builds)
    await manager.broadcast(build_id, {
        "type": "status",
        "status": "success",
        "finished_at": build["finished_at"]
    })

@app.get("/api/projects")
async def get_projects():
    projects, _ = load_data()
    return JSONResponse(content={"projects": projects})

@app.post("/api/projects")
async def create_project(project: ProjectCreate):
    projects, builds = load_data()
    
    project_id = str(uuid.uuid4())[:8]
    new_project = {
        "id": project_id,
        "name": project.name,
        "description": project.description,
        "steps": [s.model_dump() for s in project.steps],
        "created_at": datetime.now().isoformat()
    }
    
    projects.append(new_project)
    save_data(projects, builds)
    
    return JSONResponse(content={"project": new_project})

@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    projects, _ = load_data()
    project = next((p for p in projects if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return JSONResponse(content={"project": project})

@app.put("/api/projects/{project_id}")
async def update_project(project_id: str, project: ProjectCreate):
    projects, builds = load_data()
    project_idx = next((i for i, p in enumerate(projects) if p["id"] == project_id), None)
    if project_idx is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    projects[project_idx]["name"] = project.name
    projects[project_idx]["description"] = project.description
    projects[project_idx]["steps"] = [s.model_dump() for s in project.steps]
    
    save_data(projects, builds)
    return JSONResponse(content={"project": projects[project_idx]})

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    projects, builds = load_data()
    projects = [p for p in projects if p["id"] != project_id]
    builds = [b for b in builds if b["project_id"] != project_id]
    save_data(projects, builds)
    return JSONResponse(content={"success": True})

@app.post("/api/builds")
async def trigger_build(trigger: BuildTrigger):
    projects, builds = load_data()
    project = next((p for p in projects if p["id"] == trigger.project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    build_id = str(uuid.uuid4())[:8]
    new_build = {
        "id": build_id,
        "project_id": project["id"],
        "project_name": project["name"],
        "status": "pending",
        "steps": [{"name": s["name"], "status": "pending"} for s in project["steps"]],
        "logs": [],
        "started_at": datetime.now().isoformat(),
        "finished_at": None
    }
    
    builds.append(new_build)
    save_data(projects, builds)
    
    task = asyncio.create_task(simulate_build(build_id, project))
    build_tasks[build_id] = task
    
    return JSONResponse(content={"build": new_build})

@app.get("/api/builds")
async def get_builds(project_id: Optional[str] = None):
    _, builds = load_data()
    if project_id:
        builds = [b for b in builds if b["project_id"] == project_id]
    builds.sort(key=lambda x: x["started_at"], reverse=True)
    return JSONResponse(content={"builds": builds})

@app.get("/api/builds/{build_id}")
async def get_build(build_id: str):
    _, builds = load_data()
    build = next((b for b in builds if b["id"] == build_id), None)
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    return JSONResponse(content={"build": build})

@app.websocket("/ws/builds/{build_id}")
async def websocket_endpoint(websocket: WebSocket, build_id: str):
    await manager.connect(websocket, build_id)
    try:
        _, builds = load_data()
        build = next((b for b in builds if b["id"] == build_id), None)
        if build:
            for line in build["logs"]:
                await websocket.send_json({"type": "log", "line": line})
        
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, build_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=1111)
