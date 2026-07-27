#!/usr/bin/env python3
"""Validate coverage, editorial depth, media shape, and safe rendering fields."""

from __future__ import annotations

import argparse
import datetime
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent
PROJECTS_FILE = ROOT / "data" / "projects_live.json"
ARTICLES_DIR = ROOT / "data" / "case_articles"
REPORT_FILE = ROOT / "pipeline" / "data" / "case_catalog_report.json"
CHINESE_RE = re.compile(r"[\u3400-\u9fff]")
REMOVED_LABELS = ("素材来源", "核验提示", "查看事实来源")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def body_characters(article: dict) -> int:
    return (
        len(str(article.get("opening", "")))
        + len(str(article.get("conclusion", "")))
        + sum(
            len(str(paragraph))
            for section in article.get("sections", [])
            for paragraph in section.get("paragraphs", [])
        )
    )


def validate(
    require_media: bool = False,
    write_report: bool = True,
) -> tuple[dict, list[str]]:
    projects = load_json(PROJECTS_FILE)
    project_ids = {str(project["id"]) for project in projects}
    files = {path.stem: path for path in ARTICLES_DIR.glob("*.json")}
    errors: list[str] = []
    records = []

    missing = sorted(project_ids - files.keys())
    orphaned = sorted(files.keys() - project_ids)
    if missing:
        errors.append(f"Missing article files: {len(missing)}")
    if orphaned:
        errors.append(f"Orphaned article files: {len(orphaned)}")

    for project_id in sorted(project_ids & files.keys()):
        try:
            article = load_json(files[project_id])
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"{project_id}: invalid JSON ({error})")
            continue

        if str(article.get("projectId")) != project_id:
            errors.append(f"{project_id}: projectId mismatch")
        snapshot = article.get("project")
        if not isinstance(snapshot, dict) or str(snapshot.get("id")) != project_id:
            errors.append(f"{project_id}: project snapshot is missing")
        title = str(article.get("title", ""))
        if not CHINESE_RE.search(title):
            errors.append(f"{project_id}: title has no Chinese")

        sections = article.get("sections")
        if not isinstance(sections, list) or not 6 <= len(sections) <= 8:
            errors.append(f"{project_id}: expected 6-8 sections")
            sections = []
        for index, section in enumerate(sections):
            paragraphs = section.get("paragraphs", [])
            if not 2 <= len(paragraphs) <= 4:
                errors.append(
                    f"{project_id}: section {index + 1} must have 2-4 paragraphs"
                )

        character_count = body_characters(article)
        minimum = 2_400 if article.get("status") == "full" else 1_600
        if character_count < minimum:
            errors.append(
                f"{project_id}: article too short ({character_count} < {minimum})"
            )

        facts = article.get("keyFacts", [])
        if not isinstance(facts, list) or len(facts) < 3:
            errors.append(f"{project_id}: expected at least 3 key facts")

        serialized = json.dumps(article, ensure_ascii=False)
        for removed_label in REMOVED_LABELS:
            if removed_label in serialized:
                errors.append(
                    f"{project_id}: removed UI label present: {removed_label}"
                )

        media = article.get("media", [])
        if not isinstance(media, list):
            errors.append(f"{project_id}: media must be an array")
            media = []
        if require_media and not media:
            errors.append(f"{project_id}: media is required")
        for index, item in enumerate(media):
            media_type = item.get("type")
            parsed = urlparse(str(item.get("url", "")))
            if media_type not in {"image", "video", "video-file"}:
                errors.append(f"{project_id}: media {index + 1} has invalid type")
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                errors.append(f"{project_id}: media {index + 1} has invalid URL")
            if media_type == "image" and item.get("origin") not in {
                "official-site",
                "source-attributed",
            }:
                errors.append(
                    f"{project_id}: image {index + 1} has invalid origin"
                )
            if media_type == "video" and item.get("origin") != "embeddable-video":
                errors.append(
                    f"{project_id}: video {index + 1} is not embeddable"
                )

        records.append(
            {
                "projectId": project_id,
                "characters": character_count,
                "sections": len(sections),
                "media": len(media),
                "status": article.get("status", ""),
            }
        )

    without_media = [
        record["projectId"] for record in records if record["media"] == 0
    ]
    report = {
        "validatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "projectCount": len(projects),
        "articleCount": len(records),
        "coveragePercent": (
            round(len(records) * 100 / len(projects), 2) if projects else 0
        ),
        "status": dict(Counter(record["status"] for record in records)),
        "minimumCharacters": min(
            (record["characters"] for record in records), default=0
        ),
        "minimumFullCharacters": min(
            (
                record["characters"]
                for record in records
                if record["status"] == "full"
            ),
            default=0,
        ),
        "withMedia": sum(record["media"] > 0 for record in records),
        "withoutMedia": len(without_media),
        "mediaItems": sum(record["media"] for record in records),
        "withoutMediaIds": without_media,
        "errors": errors,
    }
    if write_report:
        REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
        REPORT_FILE.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return report, errors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--require-media",
        action="store_true",
        help="Treat articles without public media as errors",
    )
    args = parser.parse_args()
    report, errors = validate(args.require_media, write_report=True)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
