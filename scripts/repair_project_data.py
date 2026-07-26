#!/usr/bin/env python3
"""Remove duplicate project rows and synchronize the processed-ID index."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline.project_store import merge_projects, project_ids  # noqa: E402


PROJECTS_FILE = ROOT / "data" / "projects_live.json"
SEEN_FILE = ROOT / "pipeline" / "data" / "seen_ids.json"


def main() -> None:
    projects = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    repaired = merge_projects([], projects)

    PROJECTS_FILE.write_text(
        json.dumps(repaired, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    SEEN_FILE.write_text(
        json.dumps(sorted(project_ids(repaired)), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Repaired database: {len(projects)} -> {len(repaired)} rows")
    print(f"Synchronized {len(project_ids(repaired))} processed IDs")


if __name__ == "__main__":
    main()
