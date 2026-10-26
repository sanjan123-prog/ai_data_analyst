"""
FastAPI Enterprise Application Backend.
Exposes modular REST endpoints for:
- /api/query: Natural Language Text-to-SQL + Chart Recommendation + Grounded Insights
- /api/crud/preview: Pre-execution validation & row count estimate for INSERT, UPDATE, DELETE
- /api/crud/confirm: Transactional execution with rollback safety
- /api/ml/churn: ML Customer Churn risk inference & feature importance
- /api/rag/ask: Document Question Answering grounded strictly in embedded files
- /api/rag/upload: Ingest and index new company policy markdown files
- /api/health: Service status & MySQL health check
"""
import os
import sys
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

# Ensure local modules are accessible
sys.path.insert(0, os.path.dirname(__file__))

from analytics_pipeline import answer_question
from crud_engine import CRUDAssistant, DatabaseSecurityError
from churn_pipeline import get_churn_pipeline
from rag_engine import get_rag_engine
from db_engine import get_db_dialect

app = FastAPI(
    title="AI-Powered Data Analyst API",
    description="Natural Language Database Querying, Machine Learning Inference, Document RAG, and Safe CRUD Operations.",
    version="1.0.0"
)

# CORS setup for React frontend development and deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

crud = CRUDAssistant()
churn = get_churn_pipeline()
rag = get_rag_engine()

# Request Models
class QueryRequest(BaseModel):
    question: str = Field(..., example="What is the total sales amount for each channel?")

class CRUDCreateRequest(BaseModel):
    table: str = Field(..., example="customers")
    data: Dict[str, Any] = Field(..., example={"Customer Index": 200, "Customer Names": "Acme Corp"})

class CRUDUpdateRequest(BaseModel):
    table: str = Field(..., example="customers")
    updates: Dict[str, Any] = Field(..., example={"Customer Names": "Acme Enterprises"})
    where: Dict[str, Any] = Field(..., example={"Customer Index": 200})

class CRUDDeleteRequest(BaseModel):
    table: str = Field(..., example="customers")
    where: Dict[str, Any] = Field(..., example={"Customer Index": 200})

class CRUDConfirmRequest(BaseModel):
    preview_object: Dict[str, Any]
    confirmed: bool

class RAGQuestionRequest(BaseModel):
    question: str = Field(..., example="According to the company refund policy, what is the refund period?")

class RAGUploadRequest(BaseModel):
    doc_name: str
    content: str

# Endpoints
@app.get("/")
def root():
    return {
        "service": "AI-Powered Data Analyst Backend",
        "status": "online",
        "docs": "/docs",
        "health": "/api/health"
    }

@app.get("/api/health")
def health_check():
    dialect = "unknown"
    try:
        dialect = get_db_dialect()
    except Exception as e:
        dialect = f"error: {e}"

    return {
        "status": "healthy",
        "service": "AI-Powered Data Analyst Backend",
        "gemini_active": bool(os.getenv("GEMINI_API_KEY")),
        "db_dialect": dialect,
        "mysql_host": os.getenv("MYSQL_HOST")
    }

@app.post("/api/query")
def handle_analytics_query(req: QueryRequest):
    """Answers database questions, suggests optimal visualization, and explains results."""
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")
    result = answer_question(req.question)
    return result

@app.post("/api/crud/preview/create")
def preview_create(req: CRUDCreateRequest):
    try:
        return crud.preview_create(req.table, req.data)
    except DatabaseSecurityError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/crud/preview/update")
def preview_update(req: CRUDUpdateRequest):
    try:
        return crud.preview_update(req.table, req.updates, req.where)
    except DatabaseSecurityError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/crud/preview/delete")
def preview_delete(req: CRUDDeleteRequest):
    try:
        return crud.preview_delete(req.table, req.where)
    except DatabaseSecurityError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/crud/confirm")
def execute_confirmed_crud(req: CRUDConfirmRequest):
    try:
        return crud.execute_confirmed(req.preview_object, req.confirmed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transaction failed: {e}")

@app.get("/api/ml/churn/high-risk")
def get_churn_risk_accounts(limit: int = 5):
    """Returns accounts evaluated as highest churn risk by the Random Forest model."""
    try:
        return {"high_risk_customers": churn.predict_high_risk_customers(limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {e}")

@app.post("/api/rag/ask")
def ask_rag_document(req: RAGQuestionRequest):
    """Answers policy/procedural questions grounded exclusively in indexed documents."""
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    return rag.answer_question(req.question)

@app.post("/api/rag/upload")
def upload_rag_document(req: RAGUploadRequest):
    """Ingests and embeds custom document text into the vector store."""
    try:
        rag.ingest_document(req.doc_name, req.content)
        return {"status": "success", "message": f"Document '{req.doc_name}' indexed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")
