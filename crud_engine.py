"""
CRUD & Safe Data Operations Engine
Supports validated, parameterized INSERT, UPDATE, DELETE with explicit previews and confirmations.
"""
import os
import re
from typing import Dict, Any, List, Optional
from sqlalchemy import URL, create_engine, text
from dotenv import load_dotenv

load_dotenv()

class DatabaseSecurityError(Exception):
    pass

class CRUDAssistant:
    # Whitelist tables and permitted columns for controlled write operations
    ALLOWED_SCHEMAS = {
        "customers": ["Customer Index", "Customer Names"],
        "products": ["Index", "Product Name"],
        "2017_budgets": ["Product Name", "2017 Budgets"],
        "state_regions": ["State Code", "State", "Region"]
    }

    def __init__(self):
        mysql_url = URL.create(
            drivername="mysql+pymysql",
            username=os.getenv("MYSQL_USER"),
            password=os.getenv("MYSQL_PASSWORD"),
            host=os.getenv("MYSQL_HOST"),
            port=int(os.getenv("MYSQL_PORT", 3306)),
            database=os.getenv("MYSQL_DATABASE")
        )
        self.engine = create_engine(mysql_url)

    def preview_create(self, table: str, record_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validates and prepares an INSERT preview before execution."""
        if table not in self.ALLOWED_SCHEMAS:
            raise DatabaseSecurityError(f"Table '{table}' is restricted from write operations.")

        allowed_cols = set(self.ALLOWED_SCHEMAS[table])
        for col in record_data.keys():
            if col not in allowed_cols:
                raise DatabaseSecurityError(f"Column '{col}' is not allowed for table '{table}'.")

        bt = "`"
        cols_str = ", ".join(f"{bt}{col}{bt}" for col in record_data.keys())
        placeholders = ", ".join(f":{re.sub(r'[^a-zA-Z0-9_]', '_', col)}" for col in record_data.keys())
        params = {re.sub(r'[^a-zA-Z0-9_]', '_', col): val for col, val in record_data.items()}

        sql = f"INSERT INTO {bt}{table}{bt} ({cols_str}) VALUES ({placeholders});"

        return {
            "operation": "CREATE",
            "table": table,
            "sql_preview": sql,
            "parameters": params,
            "data": record_data,
            "estimated_affected_rows": 1,
            "requires_confirmation": True
        }

    def preview_update(self, table: str, updates: Dict[str, Any], where_clause: Dict[str, Any]) -> Dict[str, Any]:
        """Interprets and checks affected row count before executing an UPDATE."""
        if table not in self.ALLOWED_SCHEMAS:
            raise DatabaseSecurityError(f"Table '{table}' is restricted from write operations.")
        if not where_clause:
            raise DatabaseSecurityError("Unbounded UPDATE is strictly forbidden. A WHERE filter must be specified.")

        bt = "`"
        set_clauses = []
        params = {}
        for col, val in updates.items():
            param_name = f"u_{re.sub(r'[^a-zA-Z0-9_]', '_', col)}"
            set_clauses.append(f"{bt}{col}{bt} = :{param_name}")
            params[param_name] = val

        where_clauses = []
        for col, val in where_clause.items():
            param_name = f"w_{re.sub(r'[^a-zA-Z0-9_]', '_', col)}"
            where_clauses.append(f"{bt}{col}{bt} = :{param_name}")
            params[param_name] = val

        where_sql = " AND ".join(where_clauses)
        count_sql = f"SELECT COUNT(*) FROM {bt}{table}{bt} WHERE {where_sql};"
        update_sql = f"UPDATE {bt}{table}{bt} SET {', '.join(set_clauses)} WHERE {where_sql};"

        # Check rows affected in preview without executing write
        with self.engine.connect() as conn:
            where_params = {k: v for k, v in params.items() if k.startswith("w_")}
            affected_estimate = conn.execute(text(count_sql), where_params).fetchone()[0]

        return {
            "operation": "UPDATE",
            "table": table,
            "sql_preview": update_sql,
            "parameters": params,
            "estimated_affected_rows": affected_estimate,
            "requires_confirmation": True
        }

    def preview_delete(self, table: str, where_clause: Dict[str, Any]) -> Dict[str, Any]:
        """Validates filter and counts affected records before executing DELETE."""
        if table not in self.ALLOWED_SCHEMAS:
            raise DatabaseSecurityError(f"Table '{table}' is restricted from delete operations.")
        if not where_clause:
            raise DatabaseSecurityError("Unbounded DELETE is forbidden. Exact WHERE conditions are required.")

        bt = "`"
        where_clauses = []
        params = {}
        for col, val in where_clause.items():
            param_name = f"w_{re.sub(r'[^a-zA-Z0-9_]', '_', col)}"
            where_clauses.append(f"{bt}{col}{bt} = :{param_name}")
            params[param_name] = val

        where_sql = " AND ".join(where_clauses)
        count_sql = f"SELECT COUNT(*) FROM {bt}{table}{bt} WHERE {where_sql};"
        delete_sql = f"DELETE FROM {bt}{table}{bt} WHERE {where_sql};"

        with self.engine.connect() as conn:
            affected_estimate = conn.execute(text(count_sql), params).fetchone()[0]

        return {
            "operation": "DELETE",
            "table": table,
            "sql_preview": delete_sql,
            "parameters": params,
            "estimated_affected_rows": affected_estimate,
            "requires_confirmation": True
        }

    def execute_confirmed(self, preview_object: Dict[str, Any], user_confirmed: bool) -> Dict[str, Any]:
        """Executes the exact confirmed operation inside an isolated transaction with rollback protection."""
        if not user_confirmed:
            return {
                "success": False,
                "message": "Operation cancelled by user.",
                "rows_affected": 0
            }

        sql = preview_object.get("sql_preview")
        params = preview_object.get("parameters", {})
        
        with self.engine.begin() as conn:  # Transaction with auto-rollback on exception
            result = conn.execute(text(sql), params)
            affected = result.rowcount

        return {
            "success": True,
            "operation": preview_object.get("operation"),
            "table": preview_object.get("table"),
            "rows_affected": affected,
            "message": f"Successfully performed {preview_object.get('operation')} on {preview_object.get('table')}."
        }
