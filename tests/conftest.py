import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg2
import pytest
from dotenv import dotenv_values
from psycopg2 import sql


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_DEFAULT_DATABASE_URL = "postgresql://admin:pasword@127.0.0.1:5433/md_quiz"
_DEFAULT_TEST_SCHEMA = "md_quiz_pytest"
_TRUNCATE_SQL = """
TRUNCATE TABLE
  system_log,
  process_heartbeat,
  runtime_job,
  runtime_daily_metric,
  runtime_kv,
  quiz_version_asset,
  quiz_archive,
  quiz_paper,
  assignment_record,
  quiz_version,
  quiz_asset,
  quiz_definition,
  candidate
RESTART IDENTITY CASCADE
"""


def _normalize_database_url(raw: str) -> str:
    value = str(raw or "").strip()
    if not value:
        return _DEFAULT_DATABASE_URL
    if value.startswith("postgresql+psycopg2://"):
        value = "postgresql://" + value[len("postgresql+psycopg2://") :]
    parsed = urlsplit(value)
    if parsed.scheme != "postgresql" or not parsed.hostname or not parsed.path:
        return _DEFAULT_DATABASE_URL
    return urlunsplit(parsed)


def _load_base_database_url() -> str:
    raw = str(os.getenv("DATABASE_URL") or "").strip()
    if raw:
        return _normalize_database_url(raw)
    env_values = dotenv_values(ROOT / ".env")
    return _normalize_database_url(str(env_values.get("DATABASE_URL") or ""))


def _resolve_pytest_database_url() -> str:
    explicit = str(os.getenv("PYTEST_DATABASE_URL") or "").strip()
    if explicit:
        return _normalize_database_url(explicit)
    return _load_base_database_url()


def _resolve_pytest_schema() -> str:
    raw = str(os.getenv("PYTEST_DATABASE_SCHEMA") or _DEFAULT_TEST_SCHEMA).strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", raw):
        raise RuntimeError(f"Invalid PYTEST_DATABASE_SCHEMA: {raw!r}")
    return raw


def _connect(database_url: str, *, dbname: str | None = None):
    parsed = urlsplit(database_url)
    return psycopg2.connect(
        host=parsed.hostname,
        port=parsed.port,
        user=parsed.username,
        password=parsed.password,
        dbname=dbname or parsed.path.lstrip("/"),
    )


def _ensure_database_accessible(database_url: str) -> None:
    parsed = urlsplit(database_url)
    target_db = parsed.path.lstrip("/")
    conn = None
    try:
        conn = _connect(database_url)
    except psycopg2.Error as exc:
        raise RuntimeError(f"无法连接 pytest 数据库 {target_db!r}: {exc}") from exc
    finally:
        if conn is not None:
            conn.close()


def _ensure_test_schema_exists(database_url: str, schema_name: str) -> None:
    conn = None
    try:
        conn = _connect(database_url)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema_name)))
    except psycopg2.Error as exc:
        raise RuntimeError(f"无法创建 pytest 测试 schema {schema_name!r}: {exc}") from exc
    finally:
        if conn is not None:
            conn.close()


_PYTEST_DATABASE_URL = _resolve_pytest_database_url()
_PYTEST_DATABASE_SCHEMA = _resolve_pytest_schema()
_ensure_database_accessible(_PYTEST_DATABASE_URL)
_ensure_test_schema_exists(_PYTEST_DATABASE_URL, _PYTEST_DATABASE_SCHEMA)
os.environ["DATABASE_URL"] = _PYTEST_DATABASE_URL
os.environ["PGOPTIONS"] = f"-c search_path={_PYTEST_DATABASE_SCHEMA},public"
os.environ.setdefault("APP_ENV", "test")


@pytest.fixture(autouse=True)
def _reset_database_state():
    from backend.md_quiz.storage.db import conn_scope, init_db

    init_db()
    with conn_scope() as conn:
        with conn.cursor() as cur:
            cur.execute(_TRUNCATE_SQL)
    yield
