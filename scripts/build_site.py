#!/usr/bin/env python3
"""Build the minimal static artifact published to Cloudflare Pages."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PUBLISH_PATHS = (
    Path("index.html"),
    Path("case.html"),
    Path("assets/app.js"),
    Path("assets/case.js"),
    Path("assets/style.css"),
    Path("assets/case.css"),
    Path("data/projects.js"),
    Path("data/projects_live.json"),
    Path("data/case_articles.json"),
)


def build(output_dir: Path) -> list[Path]:
    output_dir = output_dir.resolve()
    if output_dir == ROOT or ROOT not in output_dir.parents:
        raise ValueError("Output directory must be a child of the repository root")

    if output_dir.exists():
        shutil.rmtree(output_dir)

    copied: list[Path] = []
    for relative_path in PUBLISH_PATHS:
        source = ROOT / relative_path
        if not source.is_file():
            raise FileNotFoundError(f"Required publish file is missing: {relative_path}")

        destination = output_dir / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        copied.append(relative_path)

    return copied


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "dist",
        help="Build output directory (default: dist)",
    )
    args = parser.parse_args()

    copied = build(args.output)
    print(f"Built {len(copied)} public files in {args.output.resolve()}")
    for path in copied:
        print(f"  - {path}")


if __name__ == "__main__":
    main()
