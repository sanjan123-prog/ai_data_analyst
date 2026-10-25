"""
Lightweight Zero-Cost Vector Store & RAG Engine.
Uses official Google Developer API gemini-embedding-001 (free tier) + Cosine Similarity.
Requires zero external vector databases (no chromadb, no docker containers).
Stores persistent embeddings directly in local JSON vector indexes.
"""
import os
import json
import math
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

from llm_client import call_llm

EMBEDDING_MODEL = "gemini-embedding-001"
VECTOR_STORAGE_FILE = os.path.join(os.path.dirname(__file__), "rag_vector_store.json")

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a, b in zip(v1, v2)))
    norm2 = math.sqrt(sum(b * b for a, b in zip(v1, v2)))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)

class DocumentRAGEngine:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.documents_index: List[Dict[str, Any]] = []
        self.load_index()

    def get_embedding(self, text: str) -> List[float]:
        """Calls Google's free-tier embedding model."""
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY missing from environment.")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:embedContent?key={self.api_key}"
        payload = {"content": {"parts": [{"text": text}]}}
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})

        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["embedding"]["values"]

    def chunk_text(self, text: str, chunk_size: int = 400, overlap: int = 50) -> List[str]:
        """Splits long markdown/prose documents into coherent paragraph chunks."""
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks = []
        current_chunk = []
        current_len = 0

        for p in paragraphs:
            p_len = len(p)
            if current_len + p_len > chunk_size and current_chunk:
                chunks.append("\n\n".join(current_chunk))
                current_chunk = [p]
                current_len = p_len
            else:
                current_chunk.append(p)
                current_len += p_len

        if current_chunk:
            chunks.append("\n\n".join(current_chunk))
        return chunks

    def ingest_document(self, doc_name: str, text_content: str):
        """Processes and indexes a document with semantic embeddings."""
        chunks = self.chunk_text(text_content)
        for i, chunk in enumerate(chunks):
            vec = self.get_embedding(chunk)
            self.documents_index.append({
                "doc_name": doc_name,
                "chunk_id": i + 1,
                "text": chunk,
                "embedding": vec
            })
        self.save_index()

    def search_similar(self, query: str, top_k: int = 2) -> List[Dict[str, Any]]:
        """Finds the most semantically relevant text passages using cosine similarity."""
        if not self.documents_index:
            return []

        q_vec = self.get_embedding(query)
        scored = []
        for item in self.documents_index:
            score = cosine_similarity(q_vec, item["embedding"])
            scored.append({
                "doc_name": item["doc_name"],
                "chunk_id": item["chunk_id"],
                "text": item["text"],
                "similarity": round(float(score), 4)
            })

        scored.sort(key=lambda x: x["similarity"], reverse=True)
        return scored[:top_k]

    def answer_question(self, question: str) -> Dict[str, Any]:
        """Retrieval Augmented Generation with verified source references and grounded answers."""
        retrieved = self.search_similar(question, top_k=2)
        if not retrieved or retrieved[0]["similarity"] < 0.35:
            return {
                "success": True,
                "question": question,
                "answer": "I could not find relevant information regarding this in the uploaded company documents.",
                "sources": []
            }

        context = "\n---\n".join([f"Source [{r['doc_name']} (Chunk {r['chunk_id']})]: {r['text']}" for r in retrieved])

        prompt = f"""You are a professional enterprise policy and document assistant.
Answer the user's question accurately and concisely, strictly grounded in the retrieved documentation passages below.
If the answer cannot be determined directly from the context, state that clearly.
Do not assume or invent facts outside the text.

Retrieved Document Passages:
{context}

Question:
{question}

Answer:"""
        
        answer = call_llm(prompt, max_tokens=150)
        return {
            "success": True,
            "question": question,
            "answer": answer,
            "sources": [{"doc_name": r["doc_name"], "chunk_id": r["chunk_id"], "similarity": r["similarity"]} for r in retrieved]
        }

    def save_index(self):
        with open(VECTOR_STORAGE_FILE, "w", encoding="utf-8") as f:
            json.dump(self.documents_index, f)

    def load_index(self):
        if os.path.exists(VECTOR_STORAGE_FILE):
            try:
                with open(VECTOR_STORAGE_FILE, "r", encoding="utf-8") as f:
                    self.documents_index = json.load(f)
            except Exception:
                self.documents_index = []

_rag_engine = None

def get_rag_engine() -> DocumentRAGEngine:
    global _rag_engine
    if _rag_engine is None:
        _rag_engine = DocumentRAGEngine()
    return _rag_engine
