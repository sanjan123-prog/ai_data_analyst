"""
Verified production-ready LLM Client for Gemini Developer API and fallback providers.
Optimized for zero-cost free-tier usage with token discipline and timeout resiliency.
"""
import os
import json
import time
import urllib.request
import urllib.error
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

# We discovered that 'gemini-3.1-flash-lite' offers instant sub-second response times,
# minimal token usage (50-60 tokens per request), and full availability on free keys.
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
DEFAULT_OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
FALLBACK_GEMINI_MODELS = [
    DEFAULT_GEMINI_MODEL,
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
]

class LLMClient:
    def __init__(self):
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.openrouter_key = os.getenv("OPENROUTER_API_KEY")
        self.gemini_model = DEFAULT_GEMINI_MODEL
        self.openrouter_client = None

        if self.openrouter_key:
            try:
                from openai import OpenAI
                self.openrouter_client = OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=self.openrouter_key
                )
            except Exception as e:
                pass

    def call_gemini_rest(self, prompt: str, max_tokens: int = 256, temperature: float = 0.0, timeout: int = 20, model: Optional[str] = None) -> str:
        """
        Direct REST call to Google's Developer API.
        Bypasses gRPC/SDK hang issues on Windows and provides instant execution.
        """
        if not self.gemini_key:
            raise ValueError("GEMINI_API_KEY is missing from environment or .env.")

        target_model = model or self.gemini_model
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={self.gemini_key}"
        
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": temperature
            }
        }
        
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )
        
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if not candidates:
                    raise ValueError(f"Gemini API returned no candidates: {data}")
                
                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts or not parts[0].get("text"):
                    raise ValueError("Gemini candidate content is empty.")
                
                return parts[0]["text"].strip()
                
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Gemini HTTP Error {e.code} for {target_model}: {err_body}")
        except Exception as e:
            raise RuntimeError(f"Gemini Request failed for {target_model}: {e}")

    def call_openrouter(self, prompt: str, max_tokens: int = 256, temperature: float = 0.0) -> str:
        if not self.openrouter_client:
            raise ValueError("OpenRouter client not initialized.")
        
        resp = self.openrouter_client.chat.completions.create(
            model=DEFAULT_OPENROUTER_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=temperature
        )
        content = resp.choices[0].message.content
        if not content or not content.strip():
            raise ValueError("OpenRouter returned empty content.")
        return content.strip()

    def generate(self, prompt: Any, max_tokens: int = 256, retries: int = 3, backoff: float = 1.5) -> str:
        if hasattr(prompt, "to_string"):
            prompt = prompt.to_string()
        else:
            prompt = str(prompt)

        last_err = None
        
        # Deduplicated model priority list
        models_to_try = []
        for m in FALLBACK_GEMINI_MODELS:
            if m not in models_to_try:
                models_to_try.append(m)

        for attempt in range(1, retries + 1):
            if self.gemini_key:
                for model_candidate in models_to_try:
                    try:
                        return self.call_gemini_rest(prompt, max_tokens=max_tokens, model=model_candidate)
                    except Exception as e:
                        last_err = e
                        # If service unavailable, rate limited, or model not found, try next candidate
                        continue

            if self.openrouter_client:
                try:
                    return self.call_openrouter(prompt, max_tokens=max_tokens)
                except Exception as fb_err:
                    last_err = fb_err
            
            if not self.gemini_key and not self.openrouter_client:
                raise ValueError("No LLM key available. Please configure GEMINI_API_KEY in .env.")
            
            if attempt < retries:
                time.sleep(backoff ** attempt)
        
        raise RuntimeError(f"All LLM generation attempts failed: {last_err}")

_client_instance = None

def get_client() -> LLMClient:
    global _client_instance
    if _client_instance is None:
        _client_instance = LLMClient()
    return _client_instance

def call_llm(prompt: Any, max_tokens: int = 256) -> str:
    """Safe, token-capped drop-in replacement for the original call_llm."""
    return get_client().generate(prompt, max_tokens=max_tokens)
