"""
Result Formatter & Visualization Recommender Engine.
Transforms executed SQL database tuples into structured JSON payloads with auto-detected chart configs.
"""
from typing import List, Dict, Any, Optional
import datetime
from decimal import Decimal

def serialize_value(val: Any) -> Any:
    """Ensures dates, Decimals, and numeric types serialize cleanly to JSON."""
    if isinstance(val, (datetime.date, datetime.datetime)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    return val

def clean_rows(columns: List[str], raw_tuples: List[Any]) -> List[Dict[str, Any]]:
    """Converts SQL tuples into clean dictionary records."""
    records = []
    for row in raw_tuples:
        if isinstance(row, dict):
            records.append({k: serialize_value(v) for k, v in row.items()})
        else:
            record = {}
            for col, val in zip(columns, row):
                record[col] = serialize_value(val)
            records.append(record)
    return records

def recommend_visualization(columns: List[str], rows: List[Dict[str, Any]], intent_hint: str = "") -> Dict[str, Any]:
    """
    Intelligently analyzes query results and recommends the best visual representation:
    - Single cell -> 'kpi' card
    - Category column + 1 Numeric column (<= 7 rows) -> 'bar' or 'pie'
    - Date / Time column + Numeric column -> 'line'
    - Multi-column complex joins -> 'table'
    """
    row_count = len(rows)
    col_count = len(columns)

    if row_count == 0:
        return {
            "type": "empty",
            "title": "No Records Found",
            "xAxis": None,
            "yAxis": None,
            "can_export_csv": False
        }

    # Case 1: Single scalar metric (e.g., COUNT(*), AVG(Line Total))
    if row_count == 1 and col_count == 1:
        col = columns[0]
        val = rows[0][col]
        return {
            "type": "kpi",
            "title": col,
            "value": val,
            "unit": "" if not any(w in col.lower() for w in ["sales", "total", "price", "revenue", "cost"]) else "$",
            "can_export_csv": True
        }

    # Detect data types per column
    first_row = rows[0]
    numeric_cols = []
    text_cols = []
    date_cols = []

    for col in columns:
        v = first_row.get(col)
        name_lower = col.lower()
        if isinstance(v, (int, float, Decimal)) and not name_lower.endswith("index") and not name_lower.endswith("id"):
            numeric_cols.append(col)
        elif any(d in name_lower for d in ["date", "month", "year", "time", "day"]) or isinstance(v, (datetime.date, datetime.datetime)):
            date_cols.append(col)
        else:
            text_cols.append(col)

    # Case 2: Time series trend (Date + Numeric)
    if date_cols and numeric_cols:
        return {
            "type": "line",
            "title": f"{numeric_cols[0]} over Time",
            "xAxis": date_cols[0],
            "yAxis": numeric_cols[0],
            "secondaryMetrics": numeric_cols[1:],
            "can_export_csv": True
        }

    # Case 3: Category breakdown (Text + Numeric)
    if text_cols and numeric_cols:
        x_col = text_cols[0]
        y_col = numeric_cols[0]
        
        # Donut/Pie chart for small proportion sets (<= 5 slices)
        if 2 <= row_count <= 5 and any(w in intent_hint.lower() for w in ["share", "percentage", "proportion", "breakdown"]):
            chart_type = "pie"
        else:
            chart_type = "bar"

        return {
            "type": chart_type,
            "title": f"{y_col} by {x_col}",
            "xAxis": x_col,
            "yAxis": y_col,
            "can_export_csv": True
        }

    # Default fallback: Interactive data table
    return {
        "type": "table",
        "title": "Detailed Query Results",
        "columns": columns,
        "rowCount": row_count,
        "can_export_csv": True
    }
