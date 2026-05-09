"""Unit tests for the DXF extractor.

Uses ezdxf to build minimal DXF documents in memory rather than disk files.
"""

import io
import pytest
import ezdxf

from src.parsers.ezdxf_extractor import Extractor


def make_dxf_bytes(**kwargs) -> bytes:
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    for fn, args in kwargs.items():
        fn(msp, doc, *args)
    buf = io.BytesIO()
    doc.write(buf)
    return buf.getvalue()


def add_block_insert(msp, doc, block_name: str, layer: str = "HVAC"):
    if block_name not in doc.blocks:
        doc.blocks.new(block_name)
    msp.add_blockref(block_name, insert=(0, 0), dxfattribs={"layer": layer})


def add_closed_polyline(msp, doc, pts, layer: str = "0"):
    msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": layer})


def add_text(msp, doc, text: str, layer: str = "ANNOT"):
    msp.add_text(text, dxfattribs={"layer": layer})


class TestBlockExtraction:
    def test_fcu_block_counted(self):
        buf = io.BytesIO()
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        if "FCU-A" not in doc.blocks:
            doc.blocks.new("FCU-A")
        msp.add_blockref("FCU-A", insert=(0, 0), dxfattribs={"layer": "HVAC-EQ"})
        msp.add_blockref("FCU-A", insert=(5, 0), dxfattribs={"layer": "HVAC-EQ"})
        doc.write(buf)

        extractor = Extractor()
        items = extractor.extract(buf.getvalue())

        fcu_items = [i for i in items if "Fan Coil" in i.description]
        assert len(fcu_items) == 1
        assert fcu_items[0].quantity == 2
        assert fcu_items[0].unit == "unit"

    def test_breaker_block_counted(self):
        buf = io.BytesIO()
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        if "MCB-20A" not in doc.blocks:
            doc.blocks.new("MCB-20A")
        msp.add_blockref("MCB-20A", insert=(0, 0), dxfattribs={"layer": "ELEC-PANEL"})
        doc.write(buf)

        extractor = Extractor()
        items = extractor.extract(buf.getvalue())

        breaker_items = [i for i in items if "Breaker" in i.description]
        assert len(breaker_items) == 1
        assert breaker_items[0].quantity == 1

    def test_unknown_block_ignored(self):
        buf = io.BytesIO()
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        if "CUSTOM-WIDGET" not in doc.blocks:
            doc.blocks.new("CUSTOM-WIDGET")
        msp.add_blockref("CUSTOM-WIDGET", insert=(0, 0))
        doc.write(buf)

        extractor = Extractor()
        items = extractor.extract(buf.getvalue())
        assert items == []


class TestPolylineAreas:
    def test_room_area_extracted(self):
        buf = io.BytesIO()
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        # 10m × 8m rectangle = 80 sqm
        pts = [(0, 0), (10, 0), (10, 8), (0, 8)]
        msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "ARCH-ROOM"})
        doc.write(buf)

        extractor = Extractor()
        items = extractor.extract(buf.getvalue())

        area_items = [i for i in items if i.unit == "sqm"]
        assert len(area_items) == 1
        assert area_items[0].quantity == 80

    def test_tiny_polyline_skipped(self):
        buf = io.BytesIO()
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        # 0.5m × 0.5m — below 1 sqm threshold
        pts = [(0, 0), (0.5, 0), (0.5, 0.5), (0, 0.5)]
        msp.add_lwpolyline(pts, close=True)
        doc.write(buf)

        extractor = Extractor()
        items = extractor.extract(buf.getvalue())
        area_items = [i for i in items if i.unit == "sqm"]
        assert area_items == []


class TestTextAnnotations:
    def test_room_label_extracted(self):
        buf = io.BytesIO()
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        msp.add_text("OFFICE 1A", dxfattribs={"layer": "ANNOT"})
        doc.write(buf)

        extractor = Extractor()
        items = extractor.extract(buf.getvalue())
        annots = [i for i in items if "OFFICE 1A" in i.description]
        assert len(annots) == 1

    def test_numeric_strings_ignored(self):
        buf = io.BytesIO()
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        msp.add_text("3450.00", dxfattribs={"layer": "DIM"})
        doc.write(buf)

        extractor = Extractor()
        items = extractor.extract(buf.getvalue())
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
