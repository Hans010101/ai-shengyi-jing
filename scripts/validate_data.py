#!/usr/bin/env python3
"""Validate the public project database before deployment."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.content_quality import project_content_errors  # noqa: E402


REQUIRED_FIELDS = ("id", "name", "nameZh", "url", "updatedAt", "revenue")


def validate(path: Path) -> tuple[int, list[str]]:
    errors: list[str] = []
    try:
        projects = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return 0, [f"Cannot read valid JSON from {path}: {exc}"]

    if not isinstance(projects, list):
        return 0, ["Top-level JSON value must be an array"]

    ids: list[str] = []
    for index, project in enumerate(projects):
        if not isinstance(project, dict):
            errors.append(f"Row {index} must be an object")
            continue

        missing = [field for field in REQUIRED_FIELDS if not project.get(field)]
        if missing:
            errors.append(f"Row {index} is missing: {', '.join(missing)}")

        if project.get("id"):
            ids.append(str(project["id"]))

        project_id = project.get("id") or f"row-{index}"
        for content_error in project_content_errors(project):
            errors.append(f"Project {project_id} {content_error}")

    duplicate_ids = sorted(
        project_id
        for project_id, count in Counter(ids).items()
        if count > 1
    )
    if duplicate_ids:
        preview = ", ".join(duplicate_ids[:10])
        errors.append(f"Duplicate project IDs: {preview}")

    return len(projects), errors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "path",
        nargs="?",
        type=Path,
        default=Path("data/projects_live.json"),
    )
    args = parser.parse_args()

    count, errors = validate(args.path)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        raise SystemExit(1)

    print(f"Validated {count} unique projects in {args.path}")


if __name__ == "__main__":
    main()
