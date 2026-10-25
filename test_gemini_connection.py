"""
Minimal Gemini API connection test.
Run: python test_gemini_connection.py
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("ERROR: GEMINI_API_KEY not found in .env or environment variables.")
    sys.exit(1)

print(f"API key found (starts with: {api_key[:8]}...)")

# --- Test 1: Import and create client ---
try:
    from google import genai
    client = genai.Client(api_key=api_key)
    print("[OK] Client created successfully")
except Exception as e:
    print(f"[FAIL] Failed to create client: {e}")
    sys.exit(1)

# --- Test 2: Simple text generation ---
try:
    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents="Return only this exact text: SELECT 1;",
        config={
            "temperature": 0,
            "max_output_tokens": 64,
        }
    )
    print(f"[OK] Generation successful")
    print(f"  Response: {response.text.strip()}")
    print(f"  Finish reason: {response.candidates[0].finish_reason}")

    if response.usage_metadata:
        um = response.usage_metadata
        print(f"  Prompt tokens: {um.prompt_token_count}")
        print(f"  Output tokens: {um.candidates_token_count}")
        print(f"  Total tokens: {um.total_token_count}")
except Exception as e:
    print(f"[FAIL] Generation failed: {e}")
    sys.exit(1)

# --- Test 3: SQL generation test ---
try:
    sql_prompt = """You are a MySQL Text-to-SQL assistant.
Convert the user's question into exactly one MySQL SELECT query.
Return only the SQL query, without Markdown or explanations.

Database schema:
CREATE TABLE customers (`Customer Index` INTEGER, `Customer Names` TEXT)

User question: How many customers are there?

SQL query:"""
    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents=sql_prompt,
        config={
            "temperature": 0,
            "max_output_tokens": 256,
        }
    )
    print(f"[OK] SQL generation test successful")
    print(f"  Generated SQL: {response.text.strip()}")
except Exception as e:
    print(f"[FAIL] SQL generation test failed: {e}")
    sys.exit(1)

print("\n" + "=" * 50)
print("ALL TESTS PASSED - Gemini API is ready to use!")
print("=" * 50)
