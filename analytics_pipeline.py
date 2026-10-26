"""
Unified Analytics & Natural Language Query Processor.
Coordinates:
User Question -> Schema Retrieval -> Token-Capped Gemini SQL -> Validation -> Execution -> 
Structured Result Formatting -> Smart Visual Recommender -> Business Explanation.
"""
import os
import re
import time
from typing import Dict, Any, List, Optional
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

from db_engine import get_db_engine
from llm_client import call_llm
from visualization_engine import clean_rows, recommend_visualization
import sqlglot
from sqlglot import exp

class AnalyticsPipeline:
    def __init__(self):
        self.engine = get_db_engine()
        self._schema_cache = None

    def get_compact_schema(self) -> str:
        """Cached concise schema definition to conserve LLM tokens."""
        if self._schema_cache:
            return self._schema_cache

        schema_lines = [
            "TABLE customers (`Customer Index` INT, `Customer Names` TEXT)",
            "TABLE products (`Index` INT, `Product Name` TEXT)",
            "TABLE regions (`id` INT, `name` TEXT, `state` TEXT, `state_code` TEXT)",
            "TABLE state_regions (`State Code` TEXT, `State` TEXT, `Region` TEXT)",
            "TABLE `2017_budgets` (`Product Name` TEXT, `2017 Budgets` DOUBLE)",
            "TABLE sales_order (`OrderNumber` TEXT, `OrderDate` TEXT formatted as 'YYYY-MM-DD', `Customer Name Index` INT, `Channel` TEXT, `Product Description Index` INT, `Delivery Region Index` INT, `Order Quantity` INT, `Unit Price` DOUBLE, `Line Total` DOUBLE, `Total Unit Cost` DOUBLE)"
        ]
        self._schema_cache = "\n".join(schema_lines)
        return self._schema_cache

    def extract_sql(self, response: str) -> str:
        if not response or not response.strip():
            raise ValueError("The LLM returned an empty response")

        response = response.strip()
        match = re.search(r"```(?:sql)?\s*(.*?)\s*```", response, flags=re.IGNORECASE | re.DOTALL)
        if match:
            response = match.group(1).strip()

        if response.lower().startswith("sql query:"):
            response = response[len("sql query:"):].strip()

        return response

    def validate_sql(self, query: str):
        if not query or not query.strip():
            return False, "SQL query is empty"

        try:
            statements = sqlglot.parse(query, read="mysql")
            if len(statements) != 1 or statements[0] is None:
                return False, "Only one SQL statement is allowed"

            statement = statements[0]
            if not isinstance(statement, exp.Select):
                return False, "Only SELECT queries are allowed for reporting"

            if statement.args.get("into") is not None:
                return False, "SELECT INTO is not allowed"

            forbidden = {"SLEEP", "BENCHMARK", "LOAD_FILE", "INTO_OUTFILE", "INTO_DUMPFILE"}
            for node in statement.walk():
                if isinstance(node, exp.Func) and node.sql_name().upper() in forbidden:
                    return False, f"Disallowed function: {node.sql_name()}"

            return True, "Valid SQL"
        except Exception as e:
            return False, f"Invalid SQL syntax: {e}"

    def generate_sql(self, question: str) -> str:
        schema = self.get_compact_schema()
        prompt = f"""You are a MySQL Text-to-SQL analyst.
Convert the user question into exactly one MySQL SELECT query.
Use backticks around column names that have spaces (e.g., `Customer Index`, `Line Total`, `Product Name`).
Return only the SQL query without any Markdown fences or explanations.

Database Schema:
{schema}

User Question:
{question}

SQL:"""
        # Strictly cap output tokens to conserve free-tier API quotas
        raw_res = call_llm(prompt, max_tokens=180)
        return self.extract_sql(raw_res)

    def generate_explanation(self, question: str, sql: str, records: List[Dict[str, Any]]) -> str:
        """Generates a concise 1-2 sentence business insight grounded solely in the verified query result."""
        if not records:
            return "No matching records were found in the database for this query."
        
        # Pass a brief snippet of results to keep prompt tokens extremely small
        sample_data = str(records[:5])
        prompt = f"""You are a professional business data analyst.
Provide a concise, 1-2 sentence plain English explanation of the result below.
Do not invent numbers. Rely only on the verified data.

Question: {question}
SQL Executed: {sql}
Result Data: {sample_data}

Explanation:"""
        try:
            return call_llm(prompt, max_tokens=100)
        except Exception:
            return "Query completed and results verified successfully."

    def ask(self, question: str) -> Dict[str, Any]:
        """
        End-to-end execution returning a fully structured payload for the frontend.
        """
        t_start = time.time()
        
        try:
            sql = self.generate_sql(question)
        except Exception as e:
            return {
                "success": False,
                "question": question,
                "sql": None,
                "error": f"Failed to generate SQL: {e}",
                "elapsed_seconds": round(time.time() - t_start, 2)
            }

        is_valid, validation_msg = self.validate_sql(sql)
        if not is_valid:
            return {
                "success": False,
                "question": question,
                "sql": sql,
                "error": f"Security validation rejected: {validation_msg}",
                "elapsed_seconds": round(time.time() - t_start, 2)
            }

        try:
            with self.engine.connect() as conn:
                res = conn.execute(text(sql))
                columns = list(res.keys())
                raw_rows = res.fetchall()

            records = clean_rows(columns, raw_rows)
            vis_recommendation = recommend_visualization(columns, records, intent_hint=question)
            explanation = self.generate_explanation(question, sql, records)

            return {
                "success": True,
                "question": question,
                "sql": sql,
                "columns": columns,
                "records": records,
                "row_count": len(records),
                "visualization": vis_recommendation,
                "explanation": explanation,
                "elapsed_seconds": round(time.time() - t_start, 2)
            }

        except Exception as db_err:
            return {
                "success": False,
                "question": question,
                "sql": sql,
                "error": f"Database execution error: {db_err}",
                "elapsed_seconds": round(time.time() - t_start, 2)
            }

_pipeline_instance = None

def get_pipeline() -> AnalyticsPipeline:
    global _pipeline_instance
    if _pipeline_instance is None:
        _pipeline_instance = AnalyticsPipeline()
    return _pipeline_instance

def answer_question(question: str) -> Dict[str, Any]:
    return get_pipeline().ask(question)
