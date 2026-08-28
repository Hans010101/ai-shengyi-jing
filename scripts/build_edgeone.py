#!/usr/bin/env python3
"""Wrap the shared static artifact with the EdgeOne-only function adapter."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EDGEONE_PATHS = (Path("edge-functions"), Path("edgeone.json"))


def build(source_dir: Path, output_dir: Path) -> list[Path]:
    source_dir = source_dir.resolve()
    output_dir = output_dir.resolve()
    if source_dir == ROOT or ROOT not in source_dir.parents:
        raise ValueError("Source directory must be a child of the repository root")
    if output_dir == ROOT or ROOT not in output_dir.parents:
        raise ValueError("Output directory must be a child of the repository root")
    if source_dir == output_dir:
        raise ValueError("Source and output directories must be different")
    if not (source_dir / "index.html").is_file():
        raise FileNotFoundError("Shared build is missing index.html")
    if not (source_dir / "deployment.json").is_file():
        raise FileNotFoundError("Shared build is missing deployment.json")

    if output_dir.exists():
        shutil.rmtree(output_dir)
    shutil.copytree(source_dir, output_dir)

    copied: list[Path] = []
    for relative_path in EDGEONE_PATHS:
        source = ROOT / relative_path
        if not source.exists():
            raise FileNotFoundError(f"Required EdgeOne path is missing: {relative_path}")
        destination = output_dir / relative_path
        if source.is_dir():
            shutil.copytree(source, destination)
        else:
            shutil.copy2(source, destination)
        copied.append(relative_path)
    return copied


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=ROOT / "dist",
        help="Shared static artifact (default: dist)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "dist-edgeone",
        help="EdgeOne deployment artifact (default: dist-edgeone)",
    )
    args = parser.parse_args()

    copied = build(args.source, args.output)
    print(f"Built EdgeOne artifact in {args.output.resolve()}")
    for path in copied:
        print(f"  - {path}")


if __name__ == "__main__":
    main()
