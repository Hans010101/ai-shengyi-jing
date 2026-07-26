import json
import tempfile
import unittest
from pathlib import Path

from pipeline.project_store import merge_projects, project_ids
from scripts.build_site import PUBLISH_PATHS, build
from scripts.validate_data import validate


class ProjectStoreTests(unittest.TestCase):
    def test_newest_project_wins_and_order_is_preserved(self):
        existing = [
            {"id": "same", "name": "old"},
            {"id": "other", "name": "other"},
            {"id": "same", "name": "older duplicate"},
        ]
        new = [{"id": "same", "name": "new"}]

        merged = merge_projects(new, existing)

        self.assertEqual(
            merged,
            [
                {"id": "same", "name": "new"},
                {"id": "other", "name": "other"},
            ],
        )
        self.assertEqual(project_ids(merged), {"same", "other"})

    def test_rows_without_ids_are_ignored(self):
        self.assertEqual(merge_projects([{"name": "invalid"}], []), [])


class BuildTests(unittest.TestCase):
    def test_build_contains_only_public_files(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temp_dir:
            output = Path(temp_dir) / "dist"
            copied = build(output)
            actual = {
                path.relative_to(output)
                for path in output.rglob("*")
                if path.is_file()
            }

        self.assertEqual(set(copied), set(PUBLISH_PATHS))
        self.assertEqual(actual, set(PUBLISH_PATHS))
        self.assertNotIn(Path(".github/workflows/deploy_cloudflare.yml"), actual)
        self.assertNotIn(Path("pipeline/drafts/example.md"), actual)


class ValidationTests(unittest.TestCase):
    def test_duplicate_ids_fail_validation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "projects.json"
            row = {
                "id": "duplicate",
                "name": "Example",
                "url": "https://example.com",
                "updatedAt": "2026-07-26",
                "revenue": "$1K/mo",
            }
            path.write_text(json.dumps([row, row]), encoding="utf-8")

            _, errors = validate(path)

        self.assertTrue(any("Duplicate project IDs" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
