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

# Layer name fragments → system label used to group scope items
LAYER_SYSTEMS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"HVAC|MECH|AIRCON|AC", re.IGNORECASE), "HVAC"),
    (re.compile(r"ELEC|POWER|LIGHTING|LTG", re.IGNORECASE), "Electrical"),
    (re.compile(r"PLUMB|SANIT|WATER|DRAIN", re.IGNORECASE), "Plumbing"),
    (re.compile(r"FIRE|SPRINK|FP", re.IGNORECASE), "Fire Protection"),
    (re.compile(r"DATA|IT|COMM|CCTV", re.IGNORECASE), "Data/Comms"),
]


@dataclass
class Extractor:
    warnings: list[str] = field(default_factory=list)

    def extract(self, dxf_bytes: bytes) -> list[ScopeItem]:
        try:
            doc: Drawing = ezdxf.read(io.BytesIO(dxf_bytes))
        except Exception as exc:
            self.warnings.append(f"ezdxf read error: {exc}")
            return []

        msp: Modelspace = doc.modelspace()
        items: list[ScopeItem] = []

        items.extend(self._extract_block_inserts(msp))
        items.extend(self._extract_polyline_areas(msp))
        items.extend(self._extract_text_annotations(msp))

        return self._deduplicate(items)

    # ------------------------------------------------------------------
    # Block inserts → equipment counts
    # ------------------------------------------------------------------

    def _extract_block_inserts(self, msp: Modelspace) -> list[ScopeItem]:
        counts: dict[str, dict] = {}  # description → {unit, layer, count}

        for entity in msp:
            if entity.dxftype() not in ("INSERT",):
                continue

            block_name: str = entity.dxf.name or ""
            layer: str = entity.dxf.layer or "0"

            for pattern, description, unit in BLOCK_PATTERNS:
                if pattern.search(block_name):
                    system = self._layer_system(layer)
                    key = f"{system}|{description}"
                    if key not in counts:
                        counts[key] = {"description": description, "unit": unit, "system": system, "count": 0}
                    counts[key]["count"] += 1
                    break

        return [
            ScopeItem(
                code=None,
                description=f"{v['system']} — {v['description']}" if v["system"] else v["description"],
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
    # TEXT / MTEXT → room labels and annotations
    # ------------------------------------------------------------------

    def _extract_text_annotations(self, msp: Modelspace) -> list[ScopeItem]:
        labels: set[str] = set()

        for entity in msp:
            if entity.dxftype() not in ("TEXT", "MTEXT"):
                continue
            try:
                text: str = entity.dxf.text if entity.dxftype() == "TEXT" else entity.plain_mtext()
                text = text.strip()
                # Only capture short room-label style text (not dimension strings)
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
