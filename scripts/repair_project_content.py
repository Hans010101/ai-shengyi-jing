#!/usr/bin/env python3
"""Remove placeholder rows and persist Chinese display names."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.content_quality import derive_chinese_name, is_placeholder  # noqa: E402
from pipeline.project_store import project_ids  # noqa: E402


PROJECTS_FILE = ROOT / "data" / "projects_live.json"
SEEN_IDS_FILE = ROOT / "pipeline" / "data" / "seen_ids.json"


def main() -> None:
    projects = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    repaired = []
    removed = []

    for project in projects:
        if is_placeholder(project):
            removed.append(project.get("id", "unknown"))
            continue
        project["nameZh"] = derive_chinese_name(project)
        repaired.append(project)

    PROJECTS_FILE.write_text(
        json.dumps(repaired, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    SEEN_IDS_FILE.write_text(
        json.dumps(sorted(project_ids(repaired)), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"Repaired project content: {len(projects)} -> {len(repaired)} rows")
    print(f"Removed placeholder IDs: {', '.join(removed) if removed else 'none'}")
    print(f"Persisted {len(repaired)} Chinese project names")


if __name__ == "__main__":
    main()
