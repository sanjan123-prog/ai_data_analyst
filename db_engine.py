"""
Database Engine Provider.
Supports:
1. Cloud MySQL or Cloud PostgreSQL via DATABASE_URL or MYSQL_* environment variables.
2. Local MySQL during local workstation execution.
3. High-performance local SQLite fallback (data/text_to_sql.db) pre-loaded with the
   identical enterprise dataset (31,880 rows across 7 tables) for seamless, zero-config
   cloud deployment on Render.
"""
import os
from pathlib import Path
from sqlalchemy import URL, create_engine, text
from dotenv import load_dotenv

load_dotenv()

SQLITE_PATH = Path(__file__).resolve().parent / "data" / "text_to_sql.db"

def get_db_engine():
    """
    Returns an SQLAlchemy engine configured for the active environment.
    """
    # 1. Direct connection string (e.g., Render DATABASE_URL, TiDB, Aiven, Supabase)
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        if database_url.startswith("mysql://"):
            database_url = database_url.replace("mysql://", "mysql+pymysql://", 1)
        elif database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql+psycopg2://", 1)
        try:
            engine = create_engine(database_url, pool_pre_ping=True)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return engine
        except Exception as e:
            print(f"[Warning] DATABASE_URL connection failed: {e}. Falling back.")

    # 2. Structured MySQL environment variables
    mysql_host = os.getenv("MYSQL_HOST")
    mysql_user = os.getenv("MYSQL_USER")
    mysql_password = os.getenv("MYSQL_PASSWORD")
    mysql_db = os.getenv("MYSQL_DATABASE", "text_to_sql")
    mysql_port = int(os.getenv("MYSQL_PORT", 3306))

    is_render = bool(os.getenv("RENDER")) or os.getenv("PORT") is not None

    if mysql_host:
        # If running on Render, 'localhost' is unreachable unless it's a real remote host
        if not is_render or (mysql_host not in ["localhost", "127.0.0.1"]):
            try:
                mysql_url = URL.create(
                    drivername="mysql+pymysql",
                    username=mysql_user,
                    password=mysql_password,
                    host=mysql_host,
                    port=mysql_port,
                    database=mysql_db
                )
                engine = create_engine(mysql_url, pool_pre_ping=True)
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                return engine
            except Exception as e:
                print(f"[Warning] MySQL connection to {mysql_host} failed: {e}. Falling back.")

    # 3. Bundled SQLite fallback containing real production data
    if SQLITE_PATH.exists():
        sqlite_url = f"sqlite:///{SQLITE_PATH.as_posix()}"
        engine = create_engine(sqlite_url)
        return engine

    raise RuntimeError("No database available. Please configure MYSQL_* or supply data/text_to_sql.db.")

def get_db_dialect():
    """Returns 'mysql' or 'sqlite' depending on the active engine."""
    engine = get_db_engine()
    return engine.dialect.name
