#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Iterable
from urllib.parse import urlsplit
from uuid import UUID

import psycopg2
from dotenv import load_dotenv
from psycopg2 import sql


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_SCHEMA = "public"


class MigrationError(RuntimeError):
    """可安全展示给终端的迁移错误。"""


@dataclass(frozen=True)
class DatabaseUrl:
    name: str
    raw: str
    normalized: str
    scheme: str
    user: str
    host: str
    port: int
    dbname: str

    @property
    def safe_description(self) -> str:
        safe_user = f"{self.user[:1]}***" if self.user else "?"
        return (
            f"{self.name}: scheme={self.scheme} user={safe_user} "
            f"host={self.host} port={self.port} db={self.dbname}"
        )

    @property
    def identity(self) -> tuple[str, int, str]:
        return (self.host.lower(), self.port, self.dbname)


def _normalize_postgres_url(raw: str) -> str:
    value = raw.strip()
    if value.startswith("postgresql+psycopg2://"):
        return "postgresql://" + value[len("postgresql+psycopg2://") :]
    return value


def _parse_database_url(name: str, raw: str) -> DatabaseUrl:
    if not raw.strip():
        raise MigrationError(f"{name} 未设置。")

    normalized = _normalize_postgres_url(raw)
    parsed = urlsplit(normalized)
    if parsed.scheme != "postgresql":
        raise MigrationError(f"{name} 只支持 postgresql/postgresql+psycopg2 连接串。")
    if not parsed.hostname or not parsed.port or not parsed.path.lstrip("/"):
        raise MigrationError(f"{name} 缺少 host、port 或 dbname。")

    return DatabaseUrl(
        name=name,
        raw=raw,
        normalized=normalized,
        scheme=parsed.scheme,
        user=parsed.username or "",
        host=parsed.hostname,
        port=parsed.port,
        dbname=parsed.path.lstrip("/"),
    )


def load_database_urls() -> tuple[DatabaseUrl, DatabaseUrl]:
    load_dotenv(PROJECT_ROOT / ".env")
    source = _parse_database_url("DATABASE_URL", os.getenv("DATABASE_URL", ""))
    target = _parse_database_url("DATABASE_URL_NEW", os.getenv("DATABASE_URL_NEW", ""))
    if source.identity == target.identity:
        raise MigrationError("DATABASE_URL 和 DATABASE_URL_NEW 指向同一个数据库，已停止。")
    return source, target


def connect_db(
    db_url: DatabaseUrl,
    *,
    readonly_snapshot: bool = False,
) -> psycopg2.extensions.connection:
    conn = psycopg2.connect(db_url.normalized)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")
        cur.execute("SET lock_timeout = 0")
        cur.execute("SET idle_in_transaction_session_timeout = 0")
        cur.execute("SET TIME ZONE 'UTC'")
        cur.execute("SET DateStyle = 'ISO, YMD'")
    conn.autocommit = False
    if readonly_snapshot:
        conn.set_session(isolation_level="REPEATABLE READ", readonly=True)
    return conn


def init_target_schema(target: DatabaseUrl) -> None:
    # backend.md_quiz.config 在 import 时读取 DATABASE_URL，因此必须先改环境变量。
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = target.normalized
    try:
        if str(PROJECT_ROOT) not in sys.path:
            sys.path.insert(0, str(PROJECT_ROOT))
        from backend.md_quiz.storage import db as app_db

        app_db.init_db()
        pool = getattr(app_db, "_PG_POOL", None)
        if pool is not None:
            pool.closeall()
            app_db._PG_POOL = None
    except Exception as exc:
        raise MigrationError("目标库初始化失败；数据库错误详情已隐藏，避免输出敏感数据。") from exc
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous


def list_public_tables(conn: psycopg2.extensions.connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name
              FROM information_schema.tables
             WHERE table_schema = %s
               AND table_type = 'BASE TABLE'
             ORDER BY table_name
            """,
            (PUBLIC_SCHEMA,),
        )
        return [str(row[0]) for row in cur.fetchall()]


def list_columns(conn: psycopg2.extensions.connection, table: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
              FROM information_schema.columns
             WHERE table_schema = %s
               AND table_name = %s
               AND COALESCE(is_generated, 'NEVER') = 'NEVER'
             ORDER BY ordinal_position
            """,
            (PUBLIC_SCHEMA, table),
        )
        return [str(row[0]) for row in cur.fetchall()]


def primary_key_columns(conn: psycopg2.extensions.connection, table: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT a.attname
              FROM pg_index i
              JOIN pg_class c ON c.oid = i.indrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              JOIN pg_attribute a
                ON a.attrelid = i.indrelid
               AND a.attnum = ANY(i.indkey)
             WHERE n.nspname = %s
               AND c.relname = %s
               AND i.indisprimary
             ORDER BY array_position(i.indkey, a.attnum)
            """,
            (PUBLIC_SCHEMA, table),
        )
        return [str(row[0]) for row in cur.fetchall()]


def foreign_key_dependencies(
    conn: psycopg2.extensions.connection, tables: Iterable[str]
) -> dict[str, set[str]]:
    table_set = set(tables)
    dependencies = {table: set() for table in table_set}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT child.relname AS child_table,
                   parent.relname AS parent_table
              FROM pg_constraint con
              JOIN pg_class child ON child.oid = con.conrelid
              JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
              JOIN pg_class parent ON parent.oid = con.confrelid
              JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
             WHERE con.contype = 'f'
               AND child_ns.nspname = %s
               AND parent_ns.nspname = %s
            """,
            (PUBLIC_SCHEMA, PUBLIC_SCHEMA),
        )
        for child, parent in cur.fetchall():
            child_name = str(child)
            parent_name = str(parent)
            if child_name in table_set and parent_name in table_set and child_name != parent_name:
                dependencies[child_name].add(parent_name)
    return dependencies


def topo_sort_tables(
    conn: psycopg2.extensions.connection, tables: Iterable[str]
) -> list[str]:
    dependencies = foreign_key_dependencies(conn, tables)
    ordered: list[str] = []
    ready = sorted(table for table, deps in dependencies.items() if not deps)

    while ready:
        table = ready.pop(0)
        ordered.append(table)
        for other in sorted(dependencies):
            if table in dependencies[other]:
                dependencies[other].remove(table)
                if not dependencies[other] and other not in ordered and other not in ready:
                    ready.append(other)
        ready.sort()

    remaining = sorted(table for table, deps in dependencies.items() if deps)
    if remaining:
        raise MigrationError(f"检测到循环外键依赖，无法安全排序：{', '.join(remaining)}")
    return ordered


def count_rows(conn: psycopg2.extensions.connection, table: str) -> int:
    query = sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(PUBLIC_SCHEMA, table))
    with conn.cursor() as cur:
        cur.execute(query)
        return int(cur.fetchone()[0])


def table_counts(
    conn: psycopg2.extensions.connection, tables: Iterable[str]
) -> dict[str, int]:
    return {table: count_rows(conn, table) for table in tables}


def validate_columns(
    source_conn: psycopg2.extensions.connection,
    target_conn: psycopg2.extensions.connection,
    tables: Iterable[str],
) -> dict[str, list[str]]:
    columns_by_table: dict[str, list[str]] = {}
    mismatches: list[str] = []
    for table in tables:
        source_columns = list_columns(source_conn, table)
        target_columns = list_columns(target_conn, table)
        if set(source_columns) != set(target_columns):
            mismatches.append(table)
            continue
        # 线上库可能经历过 ALTER TABLE ADD COLUMN，列物理顺序会和新库不同。
        # COPY/校验都显式指定列名，因此使用源库列顺序即可。
        columns_by_table[table] = source_columns

    if mismatches:
        raise MigrationError(
            "源库与目标库表结构不一致，已停止。表："
            + ", ".join(sorted(mismatches))
        )
    return columns_by_table


def ensure_target_is_empty(
    target_conn: psycopg2.extensions.connection,
    *,
    replace_target: bool,
) -> None:
    target_tables = list_public_tables(target_conn)
    counts = table_counts(target_conn, target_tables)
    non_empty = {table: count for table, count in counts.items() if count > 0}
    if not non_empty:
        return
    if not replace_target:
        preview = ", ".join(f"{table}={count}" for table, count in sorted(non_empty.items())[:8])
        raise MigrationError(
            "目标库 public schema 已有数据，默认不覆盖。"
            f" 非空表：{preview}。如确认要覆盖，请显式传入 --replace-target。"
        )

    table_list = [sql.Identifier(PUBLIC_SCHEMA, table) for table in sorted(target_tables)]
    truncate = sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY CASCADE").format(
        sql.SQL(", ").join(table_list)
    )
    with target_conn.cursor() as cur:
        cur.execute(truncate)
    target_conn.commit()


def copy_table(
    source_conn: psycopg2.extensions.connection,
    target_conn: psycopg2.extensions.connection,
    table: str,
    columns: list[str],
) -> None:
    if not columns:
        return
    column_list = sql.SQL(", ").join(sql.Identifier(column) for column in columns)
    table_ident = sql.Identifier(PUBLIC_SCHEMA, table)
    copy_out = sql.SQL("COPY {} ({}) TO STDOUT").format(table_ident, column_list)
    copy_in = sql.SQL("COPY {} ({}) FROM STDIN").format(table_ident, column_list)

    with tempfile.TemporaryFile(mode="w+", encoding="utf-8", newline="") as tmp:
        with source_conn.cursor() as source_cur:
            source_cur.copy_expert(copy_out.as_string(source_conn), tmp)
        tmp.seek(0)
        with target_conn.cursor() as target_cur:
            target_cur.copy_expert(copy_in.as_string(target_conn), tmp)


def reset_sequences(
    conn: psycopg2.extensions.connection,
    tables: Iterable[str],
    columns_by_table: dict[str, list[str]],
) -> None:
    with conn.cursor() as cur:
        for table in tables:
            for column in columns_by_table[table]:
                cur.execute(
                    "SELECT pg_get_serial_sequence(%s, %s)",
                    (f"{PUBLIC_SCHEMA}.{table}", column),
                )
                row = cur.fetchone()
                sequence_name = row[0] if row else None
                if not sequence_name:
                    continue
                max_query = sql.SQL("SELECT MAX({}) FROM {}").format(
                    sql.Identifier(column), sql.Identifier(PUBLIC_SCHEMA, table)
                )
                cur.execute(max_query)
                max_value = cur.fetchone()[0]
                if max_value is None:
                    cur.execute("SELECT setval(%s::regclass, 1, false)", (sequence_name,))
                else:
                    cur.execute(
                        "SELECT setval(%s::regclass, %s, true)",
                        (sequence_name, int(max_value)),
                    )


def normalize_for_hash(value: object) -> object:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, Decimal):
        return {"__decimal__": str(value)}
    if isinstance(value, datetime):
        normalized = value
        if normalized.tzinfo is not None:
            normalized = normalized.astimezone(UTC)
        return {"__datetime__": normalized.isoformat(timespec="microseconds")}
    if isinstance(value, date) and not isinstance(value, datetime):
        return {"__date__": value.isoformat()}
    if isinstance(value, time):
        return {"__time__": value.isoformat(timespec="microseconds")}
    if isinstance(value, memoryview):
        return {"__bytes__": bytes(value).hex()}
    if isinstance(value, (bytes, bytearray)):
        return {"__bytes__": bytes(value).hex()}
    if isinstance(value, UUID):
        return {"__uuid__": str(value)}
    if isinstance(value, list):
        return [normalize_for_hash(item) for item in value]
    if isinstance(value, tuple):
        return [normalize_for_hash(item) for item in value]
    if isinstance(value, dict):
        return {
            str(key): normalize_for_hash(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    return str(value)


def table_hash(
    conn: psycopg2.extensions.connection,
    table: str,
    columns: list[str],
) -> str:
    hasher = hashlib.sha256()
    if not columns:
        return hasher.hexdigest()
    order_columns = primary_key_columns(conn, table) or columns
    select_columns = sql.SQL(", ").join(sql.Identifier(column) for column in columns)
    order_by = sql.SQL(", ").join(sql.Identifier(column) for column in order_columns)
    query = sql.SQL("SELECT {} FROM {} ORDER BY {}").format(
        select_columns,
        sql.Identifier(PUBLIC_SCHEMA, table),
        order_by,
    )
    cursor_name = f"hash_{table}"
    with conn.cursor(name=cursor_name) as cur:
        cur.itersize = 1000
        cur.execute(query)
        for row in cur:
            normalized = normalize_for_hash(row)
            payload = json.dumps(
                normalized,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
            hasher.update(payload)
            hasher.update(b"\n")
    return hasher.hexdigest()


def verify_integrity(
    source_conn: psycopg2.extensions.connection,
    target_conn: psycopg2.extensions.connection,
    tables: Iterable[str],
    columns_by_table: dict[str, list[str]],
) -> None:
    mismatches: list[str] = []
    for table in tables:
        source_count = count_rows(source_conn, table)
        target_count = count_rows(target_conn, table)
        if source_count != target_count:
            mismatches.append(f"{table}(行数 {source_count}!={target_count})")
            continue
        source_hash = table_hash(source_conn, table, columns_by_table[table])
        target_hash = table_hash(target_conn, table, columns_by_table[table])
        if source_hash != target_hash:
            mismatches.append(f"{table}(内容摘要不一致)")

    if mismatches:
        raise MigrationError("迁移完整性校验失败：" + ", ".join(mismatches))


def print_counts(title: str, counts: dict[str, int]) -> None:
    print(title)
    for table, count in sorted(counts.items()):
        print(f"  {table}: {count}")


def run_dry_run(source: DatabaseUrl, target: DatabaseUrl) -> None:
    with closing(connect_db(source, readonly_snapshot=True)) as source_conn, closing(
        connect_db(target)
    ) as target_conn:
        source_tables = list_public_tables(source_conn)
        target_tables = list_public_tables(target_conn)
        print_counts("源库 public 表行数：", table_counts(source_conn, source_tables))
        if target_tables:
            print_counts("目标库当前 public 表行数：", table_counts(target_conn, target_tables))
        else:
            print("目标库当前没有 public base table。")


def run_migration(args: argparse.Namespace) -> None:
    source, target = load_database_urls()
    print("数据库连接：")
    print(f"  {source.safe_description}")
    print(f"  {target.safe_description}")

    if args.dry_run:
        run_dry_run(source, target)
        print("dry-run 完成，未修改目标库。")
        return

    print("初始化目标库 schema...")
    init_target_schema(target)

    with closing(connect_db(source, readonly_snapshot=True)) as source_conn, closing(
        connect_db(target)
    ) as target_conn:
        source_tables = list_public_tables(source_conn)
        target_tables = list_public_tables(target_conn)
        if not source_tables:
            raise MigrationError("源库 public schema 没有可迁移的表。")
        missing = sorted(set(source_tables) - set(target_tables))
        if missing:
            raise MigrationError("目标库缺少源库中的表：" + ", ".join(missing))

        ensure_target_is_empty(target_conn, replace_target=args.replace_target)
        target_conn.rollback()

        table_order = topo_sort_tables(target_conn, source_tables)
        columns_by_table = validate_columns(source_conn, target_conn, table_order)
        source_counts = table_counts(source_conn, table_order)
        print_counts("准备迁移的源库表行数：", source_counts)

        try:
            for index, table in enumerate(table_order, start=1):
                print(f"复制 {index}/{len(table_order)}: {table} ({source_counts[table]} 行)")
                copy_table(source_conn, target_conn, table, columns_by_table[table])
            reset_sequences(target_conn, table_order, columns_by_table)
            print("开始完整性校验...")
            verify_integrity(source_conn, target_conn, table_order, columns_by_table)
            target_conn.commit()
        except MigrationError:
            target_conn.rollback()
            raise
        except Exception as exc:
            target_conn.rollback()
            raise MigrationError("复制数据失败；数据库错误详情已隐藏，避免输出敏感数据。") from exc

        print("完整性校验通过。")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="将 DATABASE_URL 的 PostgreSQL 数据全量迁移到 DATABASE_URL_NEW。"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只检查连接和行数，不初始化 schema，不复制数据。",
    )
    parser.add_argument(
        "--replace-target",
        action="store_true",
        help="目标库已有数据时先 TRUNCATE public schema 中的表，再复制。默认拒绝覆盖。",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        run_migration(args)
    except MigrationError as exc:
        print(f"迁移失败：{exc}", file=sys.stderr)
        return 1
    except psycopg2.Error:
        print("迁移失败：数据库错误详情已隐藏，避免输出敏感数据。", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"迁移失败：{type(exc).__name__}；详情已隐藏，避免输出敏感数据。", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
