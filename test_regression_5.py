"""
Regression test suite: Tests 5 representative SQL queries against the live database
using the newly integrated Gemini pipeline with strict token caps.
"""
import sys
import os
import time

sys.path.insert(0, 'c:/Users/chint/SE_project')

from dotenv import load_dotenv
load_dotenv('c:/Users/chint/SE_project/.env')

from sqlalchemy import URL
from langchain_community.utilities import SQLDatabase
import sqlglot
from sqlglot import exp

from llm_client import call_llm

# Initialize DB connection
mysql_url = URL.create(
    drivername="mysql+pymysql",
    username=os.getenv("MYSQL_USER"),
    password=os.getenv("MYSQL_PASSWORD"),
    host=os.getenv("MYSQL_HOST"),
    port=int(os.getenv("MYSQL_PORT", 3306)),
    database=os.getenv("MYSQL_DATABASE")
)
db = SQLDatabase.from_uri(mysql_url, sample_rows_in_table_info=1)

def get_compact_schema():
    """Returns a token-minimized schema representation."""
    return db.get_table_info()

def extract_sql(response: str) -> str:
    import re
    if not response or not response.strip():
        raise ValueError("The LLM returned an empty response")

    response = response.strip()
    match = re.search(r"```(?:sql)?\s*(.*?)\s*```", response, flags=re.IGNORECASE | re.DOTALL)
    if match:
        response = match.group(1).strip()

    if response.lower().startswith("sql query:"):
        response = response[len("sql query:"):].strip()

    return response

def validate_sql(query: str):
    if not query or not query.strip():
        return False, "SQL query is empty"

    try:
        statements = sqlglot.parse(query, read="mysql")
        if len(statements) != 1 or statements[0] is None:
            return False, "Only one SQL statement is allowed"

        statement = statements[0]
        # For analytics pipeline, ensure it's a SELECT statement
        if not isinstance(statement, exp.Select):
            return False, "Only SELECT queries are allowed for reporting"

        if statement.args.get("into") is not None:
            return False, "SELECT INTO is not allowed"

        forbidden_functions = {"SLEEP", "BENCHMARK", "LOAD_FILE", "INTO_OUTFILE", "INTO_DUMPFILE"}
        for node in statement.walk():
            if isinstance(node, exp.Func):
                if node.sql_name().upper() in forbidden_functions:
                    return False, f"Disallowed function: {node.sql_name()}"

        return True, "SQL validation successful"
    except Exception as e:
        return False, f"Invalid SQL syntax: {e}"

def generate_sql(question: str) -> str:
    schema = get_compact_schema()
    prompt = f"""You are a MySQL Text-to-SQL assistant.
Convert the user question into exactly one MySQL SELECT query.
Use backticks around column names that contain spaces or special characters (e.g. `Customer Index`, `Line Total`).
Do not generate markdown fences or any explanation. Return only the SQL.

Database schema:
{schema}

User question:
{question}

SQL query:"""
    raw_response = call_llm(prompt, max_tokens=180)
    return extract_sql(raw_response)

def execute_query(sql: str):
    is_valid, msg = validate_sql(sql)
    if not is_valid:
        return False, None, msg
    try:
        res = db.run(sql)
        return True, res, "Success"
    except Exception as e:
        return False, None, str(e)

test_questions = [
    ("Count customers", "How many customers are there?"),
    ("Sales by channel", "What is the total sales amount for each channel?"),
    ("Top 5 products", "What are the top 5 products by total sales?"),
    ("Highest-selling customer", "Which customer has the highest total sales?"),
    ("Average order quantity", "What is the average order quantity?")
]

print("=" * 60)
print("RUNNING 5-QUERY REGRESSION SUITE WITH GEMINI (TOKEN-CAPPED)")
print("=" * 60)

passed = 0
for idx, (title, q) in enumerate(test_questions, 1):
    t0 = time.time()
    print(f"\n[{idx}/5] Test: {title}")
    print(f"  Question: {q}")
    try:
        sql = generate_sql(q)
        print(f"  Generated SQL: {sql}")
        ok, res, msg = execute_query(sql)
        elapsed = round(time.time() - t0, 2)
        if ok:
            passed += 1
            print(f"  Result: {str(res)[:120]}")
            print(f"  Status: [PASS] ({elapsed}s)")
        else:
            print(f"  Execution Error: {msg}")
            print(f"  Status: [FAIL] ({elapsed}s)")
    except Exception as e:
        print(f"  Pipeline Error: {e}")
        print(f"  Status: [FAIL]")

print("\n" + "=" * 60)
print(f"SUMMARY: {passed}/5 Tests Passed")
print("=" * 60)
