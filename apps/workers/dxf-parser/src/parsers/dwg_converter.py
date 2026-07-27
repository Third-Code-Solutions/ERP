"""DWG → DXF conversion via LibreDWG's dwg2dxf binary.

LibreDWG is the open-source DWG library. It ships a `dwg2dxf` command-line
tool that handles AutoCAD R13 through 2018+ DWG files. We invoke it via
subprocess against a temp file pair, then return the DXF bytes.

If the binary is missing (e.g. in local development without the system
package), the converter raises DwgConversionError with a clear message.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile

logger = logging.getLogger(__name__)

DWG2DXF_BIN = os.environ.get("DWG2DXF_BIN", "dwg2dxf")
CONVERSION_TIMEOUT_SECONDS = 120


class DwgConversionError(RuntimeError):
    """Raised when DWG→DXF conversion fails."""


def is_available() -> bool:
    """Return True if the dwg2dxf binary is callable on PATH."""
    return shutil.which(DWG2DXF_BIN) is not None


def convert_dwg_to_dxf(dwg_bytes: bytes) -> bytes:
    """Convert DWG bytes to DXF bytes.

    Writes the input to a temp file, runs dwg2dxf, and reads the resulting
    DXF file back into memory. The temp directory is cleaned up regardless
    of success or failure.
    """
    if not is_available():
        raise DwgConversionError(
            f"{DWG2DXF_BIN} binary is not available on PATH. "
            "Install libredwg-tools (Debian/Ubuntu: apt-get install libredwg-tools)."
        )

    with tempfile.TemporaryDirectory(prefix="third-code-erp-dwg-") as tmpdir:
        in_path = os.path.join(tmpdir, "input.dwg")
        out_path = os.path.join(tmpdir, "input.dxf")

        with open(in_path, "wb") as f:
            f.write(dwg_bytes)

        try:
            # --as r2010 forces a stable, fully-text DXF that ezdxf can parse
            # without falling back to recover mode. r2018 output from libredwg
            # contains binary/malformed sections that strict readers reject.
            result = subprocess.run(  # noqa: S603 - inputs are controlled
                [DWG2DXF_BIN, "-y", "--as", "r2010", in_path, "-o", out_path],
                capture_output=True,
                timeout=CONVERSION_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise DwgConversionError(
                f"dwg2dxf timed out after {CONVERSION_TIMEOUT_SECONDS}s"
            ) from exc

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            raise DwgConversionError(
                f"dwg2dxf failed (exit {result.returncode}): {stderr or 'no stderr output'}"
            )

        if not os.path.exists(out_path):
            raise DwgConversionError("dwg2dxf produced no output DXF file")

        with open(out_path, "rb") as f:
            dxf_bytes = f.read()

        logger.info(
            "Converted DWG (%d bytes) → DXF (%d bytes)", len(dwg_bytes), len(dxf_bytes)
        )
        return dxf_bytes
