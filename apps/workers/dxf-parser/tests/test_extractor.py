"""Unit tests for the DXF extractor.

Uses ezdxf to build minimal DXF documents in memory rather than disk files.
"""

import hashlib
import io
import json
import pytest
import ezdxf

from src.parsers.ezdxf_extractor import Extractor


def make_dxf_bytes(**kwargs) -> bytes:
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    for fn, args in kwargs.items():
        fn(msp, doc, *args)
    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode('utf-8')


def serialize_dxf(doc: ezdxf.document.Drawing) -> bytes:
    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode('utf-8')


def add_block_insert(msp, doc, block_name: str, layer: str = "HVAC"):
    if block_name not in doc.blocks:
        doc.blocks.new(block_name)
    msp.add_blockref(block_name, insert=(0, 0), dxfattribs={"layer": layer})


def add_closed_polyline(msp, doc, pts, layer: str = "0"):
    msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": layer})


def add_text(msp, doc, text: str, layer: str = "ANNOT"):
    msp.add_text(text, dxfattribs={"layer": layer})


class TestBlockExtraction:
    def test_extraction_fixture_has_stable_canonical_digest(self):
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        doc.blocks.new("FCU-A")
        msp.add_blockref("FCU-A", insert=(0, 0), dxfattribs={"layer": "HVAC-EQ"})
        msp.add_blockref("FCU-A", insert=(5, 0), dxfattribs={"layer": "HVAC-EQ"})
        msp.add_lwpolyline(
            [(0, 0), (10, 0), (10, 8), (0, 8)],
            close=True,
            dxfattribs={"layer": "ARCH-ROOM"},
        )

        items = Extractor().extract(serialize_dxf(doc))
        canonical = json.dumps(
            [item.model_dump(mode="json") for item in items],
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")

        assert hashlib.sha256(canonical).hexdigest() == (
            "9c7ef2bb610b87471bccd101d412b71bde8714cdb6268462765e8ad916a76644"
        )

    def test_fcu_block_counted(self):
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        if "FCU-A" not in doc.blocks:
            doc.blocks.new("FCU-A")
        msp.add_blockref("FCU-A", insert=(0, 0), dxfattribs={"layer": "HVAC-EQ"})
        msp.add_blockref("FCU-A", insert=(5, 0), dxfattribs={"layer": "HVAC-EQ"})
        extractor = Extractor()
        items = extractor.extract(serialize_dxf(doc))

        fcu_items = [i for i in items if "Fan Coil" in i.description]
        assert len(fcu_items) == 1
        assert fcu_items[0].quantity == 2
        assert fcu_items[0].unit == "unit"

    def test_breaker_block_counted(self):
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        if "MCB-20A" not in doc.blocks:
            doc.blocks.new("MCB-20A")
        msp.add_blockref("MCB-20A", insert=(0, 0), dxfattribs={"layer": "ELEC-PANEL"})
        extractor = Extractor()
        items = extractor.extract(serialize_dxf(doc))

        breaker_items = [i for i in items if "Breaker" in i.description]
        assert len(breaker_items) == 1
        assert breaker_items[0].quantity == 1

    def test_unknown_block_ignored(self):
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        if "CUSTOM-WIDGET" not in doc.blocks:
            doc.blocks.new("CUSTOM-WIDGET")
        msp.add_blockref("CUSTOM-WIDGET", insert=(0, 0))
        extractor = Extractor()
        items = extractor.extract(serialize_dxf(doc))
        assert len(items) == 1
        assert items[0].description == "Custom Widget"
        assert items[0].quantity == 1


class TestPolylineAreas:
    def test_room_area_extracted(self):
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        # 10m × 8m rectangle = 80 sqm
        pts = [(0, 0), (10, 0), (10, 8), (0, 8)]
        msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "ARCH-ROOM"})
        extractor = Extractor()
        items = extractor.extract(serialize_dxf(doc))

        area_items = [i for i in items if i.unit == "sqm"]
        assert len(area_items) == 1
        assert area_items[0].quantity == 80

    def test_tiny_polyline_skipped(self):
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        # 0.5m × 0.5m — below 1 sqm threshold
        pts = [(0, 0), (0.5, 0), (0.5, 0.5), (0, 0.5)]
        msp.add_lwpolyline(pts, close=True)
        extractor = Extractor()
        items = extractor.extract(serialize_dxf(doc))
        area_items = [i for i in items if i.unit == "sqm"]
        assert area_items == []

    def test_fractional_area_is_preserved_without_rounding(self):
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        # 1.5m × 1m rectangle = 1.5 sqm. The current BOM schema cannot
        # persist it yet, but the extractor must not falsify source evidence.
        pts = [(0, 0), (1.5, 0), (1.5, 1), (0, 1)]
        msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "ARCH-ROOM"})
        extractor = Extractor()
        items = extractor.extract(serialize_dxf(doc))

        area_items = [i for i in items if i.unit == "sqm"]
        assert len(area_items) == 1
        assert area_items[0].quantity == 1.5


class TestTextAnnotations:
    def test_room_label_extracted(self):
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        msp.add_text("OFFICE 1A", dxfattribs={"layer": "ANNOT"})
        extractor = Extractor()
        items = extractor.extract(serialize_dxf(doc))
        annots = [i for i in items if "OFFICE 1A" in i.description]
        assert len(annots) == 1

    def test_numeric_strings_ignored(self):
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        msp.add_text("3450.00", dxfattribs={"layer": "DIM"})
        extractor = Extractor()
        items = extractor.extract(serialize_dxf(doc))
        dim_annots = [i for i in items if "3450" in i.description]
        assert dim_annots == []


class TestMalformedInput:
    def test_garbage_bytes_returns_empty(self):
        extractor = Extractor()
        items = extractor.extract(b"not a dxf file at all")
        assert items == []
        assert len(extractor.warnings) > 0

    def test_empty_bytes_returns_empty(self):
        extractor = Extractor()
        items = extractor.extract(b"")
        assert items == []
