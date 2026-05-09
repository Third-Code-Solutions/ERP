"""Writes extracted scope items to Postgres via psycopg3."""

from __future__ import annotations

import uuid

import psycopg

from src.config import settings
from src.models import ScopeItem


async def write_scope_items(
    project_id: str,
    tenant_id: str,
    document_id: str,
    items: list[ScopeItem],
) -> int:
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        async with conn.cursor() as cur:
            # Delete previous auto-extracted scope items for this document
            await cur.execute(
                "DELETE FROM scope_items WHERE project_id = %s AND tenant_id = %s AND notes LIKE %s",
                (project_id, tenant_id, f"%document:{document_id}%"),
            )

            rows = [
                (
                    str(uuid.uuid4()),
                    tenant_id,
                    project_id,
                    item.code,
                    item.description,
                    item.unit,
                    item.quantity,
                    item.unit_cost_cents,
                    item.unit_cost_cents * item.quantity,  # line_total_cents
                    i,  # sort_order
                    f"auto-extracted; document:{document_id}" + (f"; {item.notes}" if item.notes else ""),
                )
                for i, item in enumerate(items)
            ]

            if rows:
                await cur.executemany(
                    """
                    INSERT INTO scope_items
                        (id, tenant_id, project_id, code, description, unit,
                         quantity, unit_cost_cents, line_total_cents, sort_order, notes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    rows,
                )

            await conn.commit()
            return len(rows)
