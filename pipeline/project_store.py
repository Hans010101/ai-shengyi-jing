"""Shared helpers for keeping the project database consistent."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any


Project = dict[str, Any]


def project_ids(projects: Iterable[Project]) -> set[str]:
    """Return all non-empty project IDs."""
    return {
        str(project["id"])
        for project in projects
        if isinstance(project, dict) and project.get("id")
    }


def merge_projects(
    new_projects: Iterable[Project],
    existing_projects: Iterable[Project],
) -> list[Project]:
    """Merge newest-first project rows and keep one row per project ID.

    Rows from ``new_projects`` take precedence over rows already in the
    database. Entries without an ID are ignored because they cannot be
    updated or deduplicated safely.
    """
    merged: list[Project] = []
    seen: set[str] = set()

    for project in [*new_projects, *existing_projects]:
        if not isinstance(project, dict) or not project.get("id"):
            continue

        project_id = str(project["id"])
        if project_id in seen:
            continue

        seen.add(project_id)
        merged.append(project)

    return merged
