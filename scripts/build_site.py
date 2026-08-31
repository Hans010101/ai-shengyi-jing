#!/usr/bin/env python3
"""Build the shared static artifact published to Cloudflare and EdgeOne."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parent.parent
PUBLISH_PATHS = (
    Path("index.html"),
    Path("cases.html"),
    Path("case.html"),
    Path("404.html"),
    Path("_headers"),
    Path("robots.txt"),
    Path("assets/app.js"),
    Path("assets/i18n.js"),
    Path("assets/cases.js"),
    Path("assets/case.js"),
    Path("assets/style.css"),
    Path("assets/cases.css"),
    Path("assets/case.css"),
    Path("data/projects.js"),
    Path("data/projects_live.json"),
    Path("data/case_articles.json"),
    Path("data/case_articles"),
)
GENERATED_PATHS = (
    Path("deployment.json"),
    Path("sitemap.xml"),
    Path("data/case_collection_dates.json"),
    Path("data/projects_index.json"),
)

PROJECT_INDEX_FIELDS = (
    "id",
    "name",
    "nameZh",
    "slug",
    "summary",
    "metaDesc",
    "description",
    "niche",
    "tags",
    "revenue",
    "difficulty",
    "featured",
    "replicabilityScore",
    "image",
    "startupCost",
    "timeToRevenue",
    "updatedAt",
    "scrapedAt",
)
SITE_URL = "https://aishengyijing.asia"


def public_output_paths() -> tuple[Path, ...]:
    files: list[Path] = []
    for relative_path in PUBLISH_PATHS:
        source = ROOT / relative_path
        if source.is_file():
            files.append(relative_path)
        elif source.is_dir():
            files.extend(
                path.relative_to(ROOT)
                for path in sorted(source.rglob("*"))
                if path.is_file()
            )
        else:
            raise FileNotFoundError(
                f"Required publish path is missing: {relative_path}"
            )
    return tuple(files) + GENERATED_PATHS


PUBLIC_OUTPUT_PATHS = public_output_paths()


def resolve_commit_sha(commit_sha: str | None = None) -> str:
    candidate = (commit_sha or "").strip().lower()
    if not candidate:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        candidate = result.stdout.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", candidate):
        raise ValueError("Deployment commit must be a full 40-character Git SHA")
    return candidate


def load_projects() -> list[dict]:
    projects = json.loads((ROOT / "data/projects_live.json").read_text(encoding="utf-8"))
    if not isinstance(projects, list):
        raise ValueError("Project database must be a JSON array")
    return [project for project in projects if isinstance(project, dict)]


def build_project_index(projects: list[dict] | None = None) -> list[dict]:
    projects = projects if projects is not None else load_projects()
    return [
        {key: project[key] for key in PROJECT_INDEX_FIELDS if key in project}
        for project in projects
    ]


def build_case_collection_dates(projects: list[dict] | None = None) -> dict[str, str]:
    projects = projects if projects is not None else load_projects()

    dates: dict[str, str] = {}
    for project in projects:
        project_id = str(project.get("id") or "").strip()
        collected_at = str(
            project.get("scrapedAt") or project.get("updatedAt") or ""
        ).strip()
        if project_id and collected_at:
            dates[project_id] = collected_at[:10]
    return dates


def build_sitemap(projects: list[dict] | None = None) -> str:
    projects = projects if projects is not None else load_projects()
    urls = [f"{SITE_URL}/", f"{SITE_URL}/cases.html"]
    rows = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    rows.extend(f"  <url><loc>{escape(url)}</loc></url>" for url in urls)
    for project in projects:
        project_id = str(project.get("id") or "").strip()
        if not project_id:
            continue
        updated = str(project.get("updatedAt") or project.get("scrapedAt") or "")[:10]
        lastmod = f"<lastmod>{escape(updated)}</lastmod>" if updated else ""
        url = f"{SITE_URL}/case.html?id={quote(project_id, safe='')}"
        rows.append(f"  <url><loc>{escape(url)}</loc>{lastmod}</url>")
    rows.append("</urlset>")
    return "\n".join(rows) + "\n"


def build(output_dir: Path, commit_sha: str | None = None) -> list[Path]:
    output_dir = output_dir.resolve()
    if output_dir == ROOT or ROOT not in output_dir.parents:
        raise ValueError("Output directory must be a child of the repository root")

    if output_dir.exists():
        shutil.rmtree(output_dir)

    copied: list[Path] = []
    for relative_path in PUBLISH_PATHS:
        source = ROOT / relative_path
        destination = output_dir / relative_path
        if source.is_file():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            copied.append(relative_path)
        elif source.is_dir():
            shutil.copytree(source, destination)
            copied.extend(
                path.relative_to(ROOT)
                for path in sorted(source.rglob("*"))
                if path.is_file()
            )
        else:
            raise FileNotFoundError(
                f"Required publish path is missing: {relative_path}"
            )

    projects = load_projects()
    resolved_commit = resolve_commit_sha(commit_sha)
    deployment_path = output_dir / Path("deployment.json")
    deployment_path.write_text(
        json.dumps(
            {
                "commit": resolved_commit,
                "shortCommit": resolved_commit[:12],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    collection_dates_path = output_dir / Path("data/case_collection_dates.json")
    collection_dates_path.parent.mkdir(parents=True, exist_ok=True)
    collection_dates_path.write_text(
        json.dumps(
            build_case_collection_dates(projects),
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    project_index_path = output_dir / Path("data/projects_index.json")
    project_index_path.write_text(
        json.dumps(
            build_project_index(projects),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )

    (output_dir / "sitemap.xml").write_text(
        build_sitemap(projects),
        encoding="utf-8",
    )
    copied.extend(GENERATED_PATHS)
    return copied


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "dist",
        help="Build output directory (default: dist)",
    )
    parser.add_argument(
        "--commit-sha",
        help="Full Git commit SHA embedded in deployment.json (default: current HEAD)",
    )
    args = parser.parse_args()

    copied = build(args.output, args.commit_sha)
    print(f"Built {len(copied)} public files in {args.output.resolve()}")
    if len(copied) <= 100:
        for path in copied:
            print(f"  - {path}")
    else:
        print(
            "  - "
            f"{len(copied) - len(GENERATED_PATHS)} source files "
            f"+ {len(GENERATED_PATHS)} generated files"
        )


if __name__ == "__main__":
    main()
