"""
Extracts scope items from DXF drawings using ezdxf.

Strategy:
  1. Read all TEXT/MTEXT entities — room labels, annotations, equipment tags
  2. Read INSERT (block reference) entities — FCU, breakers, fixtures are blocks
  3. Read LWPOLYLINE/POLYLINE entities — closed polylines define room areas
  4. Group by layer name to infer system type (MEP layer conventions)
"""

from __future__ import annotations

import io
import math
import re
from dataclasses import dataclass, field

import ezdxf
from ezdxf.document import Drawing
from ezdxf.layouts import Modelspace

from src.models import ScopeItem


# Known MEP block name fragments → material description
BLOCK_PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"FCU|FAN.?COIL", re.IGNORECASE), "Fan Coil Unit", "unit"),
    (re.compile(r"AHU|AIR.?HANDL", re.IGNORECASE), "Air Handling Unit", "unit"),
    (re.compile(r"VRF|VRV", re.IGNORECASE), "VRF Indoor Unit", "unit"),
    (re.compile(r"EXHAUST|EF-", re.IGNORECASE), "Exhaust Fan", "unit"),
    (re.compile(r"BREAKER|MCB|MCCB", re.IGNORECASE), "Circuit Breaker", "unit"),
    (re.compile(r"PANEL|MDB|DB-", re.IGNORECASE), "Distribution Panel", "unit"),
    (re.compile(r"LIGHT|LUX|DOWNLIGHT|TROFFER", re.IGNORECASE), "Lighting Fixture", "unit"),
    (re.compile(r"OUTLET|RECPT|GPO", re.IGNORECASE), "Power Outlet", "unit"),
    (re.compile(r"SPRINKLER|SPK", re.IGNORECASE), "Sprinkler Head", "unit"),
    (re.compile(r"CCTV|CAMERA", re.IGNORECASE), "CCTV Camera", "unit"),
    (re.compile(r"SMOKE|DETECTOR|SD-", re.IGNORECASE), "Smoke Detector", "unit"),
    (re.compile(r"TOILET|WC|LAVATORY", re.IGNORECASE), "Toilet Fixture", "unit"),
    (re.compile(r"SINK|BASIN", re.IGNORECASE), "Basin/Sink", "unit"),
]

# Layer name fragments → system label. Order matters: more specific patterns
# go first. Covers MEP, architectural, civil, structural, and landscape conventions
# common in Philippine practice.
LAYER_SYSTEMS: list[tuple[re.Pattern[str], str]] = [
    # MEP — most specific
    (re.compile(r"HVAC|MECH|AIRCON|AC[-_]", re.IGNORECASE), "HVAC"),
    (re.compile(r"ELEC|POWER|LIGHTING|LTG|^E[-_]", re.IGNORECASE), "Electrical"),
    (re.compile(r"PLUMB|SANIT|WATER|DRAIN|PIPE|^P[-_]", re.IGNORECASE), "Plumbing"),
    (re.compile(r"FIRE|SPRINK|FP|^F[-_]", re.IGNORECASE), "Fire Protection"),
    (re.compile(r"DATA|IT[-_]|COMM|CCTV|TEL", re.IGNORECASE), "Data/Comms"),
    # Architectural
    (re.compile(r"^A[-_]WALL|WALL", re.IGNORECASE), "Architecture — Walls"),
    (re.compile(r"^A[-_]FLOR|FLOOR|FLR", re.IGNORECASE), "Architecture — Floor"),
    (re.compile(r"^A[-_]DOOR|DOOR", re.IGNORECASE), "Architecture — Doors"),
    (re.compile(r"^A[-_]GLAZ|WIN(D|DOW)", re.IGNORECASE), "Architecture — Windows"),
    (re.compile(r"^A[-_]CEIL|CEIL", re.IGNORECASE), "Architecture — Ceiling"),
    (re.compile(r"^A[-_]ROOF|ROOF", re.IGNORECASE), "Architecture — Roof"),
    (re.compile(r"^A[-_]DETL|DETAIL", re.IGNORECASE), "Architecture — Details"),
    (re.compile(r"^A[-_]", re.IGNORECASE), "Architecture"),
    # Civil / site
    (re.compile(r"^C[-_]TOPO|TOPO|CONTOUR", re.IGNORECASE), "Civil — Topography"),
    (re.compile(r"^C[-_]ROAD|ROAD|PAVE", re.IGNORECASE), "Civil — Roads"),
    (re.compile(r"^C[-_]SITE|SITE", re.IGNORECASE), "Civil — Site"),
    (re.compile(r"^C[-_]", re.IGNORECASE), "Civil"),
    # Structural
    (re.compile(r"^S[-_]COLS|COLUMN", re.IGNORECASE), "Structural — Columns"),
    (re.compile(r"^S[-_]BEAM|BEAM", re.IGNORECASE), "Structural — Beams"),
    (re.compile(r"^S[-_]SLAB|SLAB", re.IGNORECASE), "Structural — Slab"),
    (re.compile(r"^S[-_]FNDN|FOUND", re.IGNORECASE), "Structural — Foundation"),
    (re.compile(r"^S[-_]", re.IGNORECASE), "Structural"),
    # Landscape
    (re.compile(r"LAND|TREE|PLANT|VEG|POND|GARDEN", re.IGNORECASE), "Landscape"),
    # Annotations / dimensions / general
    (re.compile(r"^G[-_]ANNO|ANNO", re.IGNORECASE), "Annotations"),
    (re.compile(r"DIM[-_]?", re.IGNORECASE), "Dimensions"),
]

# Annotation regex — captures area declarations baked into MTEXT/TEXT
AREA_ANNOTATION = re.compile(
    r"AREA[\s:=]+([\d,]+\.?\d*)\s*(SQM|SQ\.?\s?M|M2|SQ M)", re.IGNORECASE
)


@dataclass
class Extractor:
    warnings: list[str] = field(default_factory=list)

    def extract(self, dxf_bytes: bytes) -> list[ScopeItem]:
        # ezdxf's strict reader handles libredwg r2010 output cleanly when
        # given a file path. Stream-based parsing (StringIO/BytesIO) hits
        # encoding edge cases, so we materialise to a temp file first.
        import os
        import tempfile

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=".dxf"
            ) as tmp:
                tmp.write(dxf_bytes)
                tmp_path = tmp.name

            try:
                doc: Drawing = ezdxf.readfile(tmp_path)
            except Exception as strict_exc:
                # Fall back to recover mode for malformed DXFs
                try:
                    from ezdxf import recover

                    doc, auditor = recover.readfile(tmp_path)
                    if auditor.has_errors:
                        for err in auditor.errors[:3]:
                            self.warnings.append(f"DXF audit: {err}")
                except Exception as recover_exc:
                    self.warnings.append(
                        f"ezdxf read failed (strict={strict_exc}; recover={recover_exc})"
                    )
                    return []
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

        msp: Modelspace = doc.modelspace()
        items: list[ScopeItem] = []

        items.extend(self._extract_block_inserts(msp))
        items.extend(self._extract_polyline_areas(msp))
        items.extend(self._extract_declared_areas(msp))
        items.extend(self._extract_layer_rollup(msp))
        items.extend(self._extract_text_annotations(msp))

        return self._deduplicate(items)

    # ------------------------------------------------------------------
    # Block inserts → equipment counts
    # ------------------------------------------------------------------

    def _extract_block_inserts(self, msp: Modelspace) -> list[ScopeItem]:
        counts: dict[str, dict] = {}

        for entity in msp:
            if entity.dxftype() not in ("INSERT",):
                continue

            block_name: str = entity.dxf.name or ""
            layer: str = entity.dxf.layer or "0"
            system = self._layer_system(layer)

            matched = False
            for pattern, description, unit in BLOCK_PATTERNS:
                if pattern.search(block_name):
                    key = f"{system}|{description}"
                    if key not in counts:
                        counts[key] = {
                            "description": description,
                            "unit": unit,
                            "system": system,
                            "count": 0,
                        }
                    counts[key]["count"] += 1
                    matched = True
                    break

            if not matched:
                # Unmatched block — record it generically so the estimator sees it
                cleaned = re.sub(r"[_\-]+", " ", block_name).strip().title()
                if not cleaned:
                    continue
                # Truncate Sketchup-style noise like "Untitled_skp-2312370-_3D_"
                cleaned = re.sub(r"\s*Untitled.*$", "", cleaned).strip()
                if len(cleaned) > 60:
                    cleaned = cleaned[:57] + "…"
                key = f"{system}|block:{cleaned}"
                if key not in counts:
                    counts[key] = {
                        "description": cleaned,
                        "unit": "unit",
                        "system": system,
                        "count": 0,
                    }
                counts[key]["count"] += 1

        return [
            ScopeItem(
                code=None,
                description=(
                    f"{v['system']} — {v['description']}"
                    if v["system"]
                    else v["description"]
                ),
                unit=v["unit"],
                quantity=v["count"],
                unit_cost_cents=0,
                notes=None,
            )
            for v in counts.values()
            if v["count"] > 0
        ]

    # ------------------------------------------------------------------
    # Closed polylines → room areas (sqm)
    # ------------------------------------------------------------------

    def _extract_polyline_areas(self, msp: Modelspace) -> list[ScopeItem]:
        items: list[ScopeItem] = []

        for entity in msp:
            if entity.dxftype() not in ("LWPOLYLINE", "POLYLINE"):
                continue

            try:
                if entity.dxftype() == "LWPOLYLINE":
                    if not entity.closed:
                        continue
                    pts = [(p[0], p[1]) for p in entity.get_points()]
                else:
                    if not entity.is_closed:
                        continue
                    pts = [(v.dxf.location.x, v.dxf.location.y) for v in entity.vertices]

                area_m2 = abs(self._shoelace(pts))
                if area_m2 < 1.0:  # skip tiny slivers
                    continue

                layer = entity.dxf.layer or "0"
                system = self._layer_system(layer) or "Area"

                items.append(ScopeItem(
                    code=None,
                    description=f"{system} — Floor Area ({layer})",
                    unit="sqm",
                    quantity=round(area_m2),
                    unit_cost_cents=0,
                    notes=f"Layer: {layer}",
                ))
            except Exception as exc:
                self.warnings.append(f"Polyline area error: {exc}")

        return items

    # ------------------------------------------------------------------
    # MTEXT/TEXT containing area declarations (e.g. "AREA : 1350 SQM")
    # ------------------------------------------------------------------

    def _extract_declared_areas(self, msp: Modelspace) -> list[ScopeItem]:
        items: list[ScopeItem] = []
        seen_label_for: dict[str, str] = {}
        last_label: str | None = None

        # First pass: collect all text content in document order so we can
        # associate AREA values with the most recent label nearby.
        for entity in msp:
            if entity.dxftype() not in ("TEXT", "MTEXT"):
                continue
            try:
                text: str = (
                    entity.dxf.text
                    if entity.dxftype() == "TEXT"
                    else entity.plain_text() if hasattr(entity, "plain_text") else entity.plain_mtext()
                )
            except Exception:
                continue
            text = text.strip()

            m = AREA_ANNOTATION.search(text)
            if m:
                value = float(m.group(1).replace(",", ""))
                if value <= 0:
                    continue
                label = last_label or "Declared area"
                # Avoid duplicating identical label+value pairs
                key = f"{label}|{round(value)}"
                if key in seen_label_for:
                    continue
                seen_label_for[key] = label
                items.append(
                    ScopeItem(
                        code=None,
                        description=f"Declared area — {label}",
                        unit="sqm",
                        quantity=round(value),
                        unit_cost_cents=0,
                        notes=f"From drawing annotation: {text[:60]}",
                    )
                )
            elif 2 <= len(text) <= 40 and not text.upper().startswith("AREA"):
                # Treat as a candidate label for the next AREA we encounter
                last_label = text

        return items

    # ------------------------------------------------------------------
    # Layer roll-up — entity counts per layer (always returns something useful)
    # ------------------------------------------------------------------

    def _extract_layer_rollup(self, msp: Modelspace) -> list[ScopeItem]:
        # Skip annotation/dimension layers from the roll-up (they're noise)
        SKIP_PATTERNS = re.compile(r"^(0|defpoints|dim|anno|hatch)", re.IGNORECASE)
        counts: dict[str, int] = {}
        for entity in msp:
            layer = entity.dxf.layer or "0"
            if SKIP_PATTERNS.match(layer):
                continue
            counts[layer] = counts.get(layer, 0) + 1

        items: list[ScopeItem] = []
        for layer, n in sorted(counts.items(), key=lambda kv: -kv[1]):
            if n < 2:
                continue
            system = self._layer_system(layer) or "Unclassified"
            items.append(
                ScopeItem(
                    code=None,
                    description=f"{system} — Layer roll-up ({layer})",
                    unit="entities",
                    quantity=n,
                    unit_cost_cents=0,
                    notes=f"Layer: {layer}",
                )
            )
        return items

    # ------------------------------------------------------------------
    # TEXT / MTEXT → room labels and annotations
    # ------------------------------------------------------------------

    def _extract_text_annotations(self, msp: Modelspace) -> list[ScopeItem]:
        labels: set[str] = set()

        for entity in msp:
            if entity.dxftype() not in ("TEXT", "MTEXT"):
                continue
            try:
                text: str = (
                    entity.dxf.text
                    if entity.dxftype() == "TEXT"
                    else entity.plain_text()
                    if hasattr(entity, "plain_text")
                    else entity.plain_mtext()
                )
                text = text.strip()
                # Skip area declarations (handled by _extract_declared_areas)
                if AREA_ANNOTATION.search(text):
                    continue
                if 2 <= len(text) <= 40 and not re.match(r"^[\d.]+$", text):
                    labels.add(text)
            except Exception:
                pass

        return [
            ScopeItem(
                code=None,
                description=f"Annotation: {label}",
                unit="note",
                quantity=1,
                unit_cost_cents=0,
                notes="Extracted from drawing annotation",
            )
            for label in sorted(labels)
        ]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _shoelace(pts: list[tuple[float, float]]) -> float:
        n = len(pts)
        area = 0.0
        for i in range(n):
            j = (i + 1) % n
            area += pts[i][0] * pts[j][1]
            area -= pts[j][0] * pts[i][1]
        return area / 2.0

    @staticmethod
    def _layer_system(layer: str) -> str:
        for pattern, system in LAYER_SYSTEMS:
            if pattern.search(layer):
                return system
        return ""

    @staticmethod
    def _deduplicate(items: list[ScopeItem]) -> list[ScopeItem]:
        seen: set[str] = set()
        result: list[ScopeItem] = []
        for item in items:
            key = f"{item.description}|{item.unit}"
            if key not in seen:
                seen.add(key)
                result.append(item)
        return result
