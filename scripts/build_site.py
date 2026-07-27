#!/usr/bin/env python3
"""Build the shared static artifact published to Cloudflare and EdgeOne."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
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
GENERATED_PATHS = (Path("deployment.json"),)
PUBLIC_OUTPUT_PATHS = PUBLISH_PATHS + GENERATED_PATHS


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


def build(output_dir: Path, commit_sha: str | None = None) -> list[Path]:
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

    resolved_commit = resolve_commit_sha(commit_sha)
    deployment_path = output_dir / GENERATED_PATHS[0]
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
    for path in copied:
        print(f"  - {path}")


if __name__ == "__main__":
    main()
