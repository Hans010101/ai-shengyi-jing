import json
import tempfile
import unittest
from pathlib import Path

from pipeline.project_store import merge_projects, project_ids
from pipeline.content_quality import derive_chinese_name, is_placeholder
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

    def test_public_ui_does_not_render_english_project_subtitles(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temp_dir:
            output = Path(temp_dir) / "dist"
            build(output)
            app_js = (output / "assets/app.js").read_text(encoding="utf-8")
            style_css = (output / "assets/style.css").read_text(encoding="utf-8")

        self.assertNotIn('class="card-name-en"', app_js)
        self.assertNotIn('class="modal-name-en"', app_js)
        self.assertNotIn(".card-name-en", style_css)
        self.assertNotIn(".modal-name-en", style_css)

    def test_public_ui_has_no_login_gate(self):
        index_html = Path("index.html").read_text(encoding="utf-8")
        app_js = Path("assets/app.js").read_text(encoding="utf-8")

        for removed_id in (
            "headerLoginBtn",
            "authOverlay",
            "memberOverlay",
            "menuAdminDashboard",
        ):
            self.assertNotIn(removed_id, index_html)
            self.assertNotIn(removed_id, app_js)

        self.assertNotIn("CURRENT_USER", app_js)
        self.assertNotIn("showAuthModal", app_js)
        self.assertIn('id="headerLibraryBtn"', index_html)
        self.assertIn('id="libraryOverlay"', index_html)
        self.assertIn("Cloudflare Workers AI", index_html)
        self.assertIn("'/api/advisor'", app_js)

    def test_cloudflare_ai_binding_and_function_are_configured(self):
        config = json.loads(Path("wrangler.jsonc").read_text(encoding="utf-8"))
        function_js = Path("functions/api/advisor.js").read_text(encoding="utf-8")

        self.assertEqual(config["pages_build_output_dir"], "./dist")
        self.assertEqual(config["ai"]["binding"], "AI")
        self.assertIn("context.env.AI.run", function_js)
        self.assertIn("@cf/meta/llama-3.2-3b-instruct", function_js)


class ValidationTests(unittest.TestCase):
    def test_duplicate_ids_fail_validation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "projects.json"
            row = {
                "id": "duplicate",
                "name": "Example",
                "nameZh": "示例项目",
                "url": "https://example.com",
                "updatedAt": "2026-07-26",
                "revenue": "$1K/mo",
                "summary": "示例项目介绍",
                "insight": "示例项目的创意亮点",
                "businessModel": "订阅收费",
                "chinaOpportunity": "适合中国市场",
                "productArch": "入口 ➔ 服务",
                "businessLoop": "引流 ➔ 付费",
                "getStartedPath": ["第一步", "第二步", "第三步"],
            }
            path.write_text(json.dumps([row, row]), encoding="utf-8")

            _, errors = validate(path)

        self.assertTrue(any("Duplicate project IDs" in error for error in errors))

    def test_content_validation_rejects_incomplete_project(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "projects.json"
            row = {
                "id": "incomplete",
                "name": "English title",
                "url": "https://www.starterstory.com/data",
                "updatedAt": "2026-07-26",
                "revenue": "$1K/mo",
            }
            path.write_text(json.dumps([row]), encoding="utf-8")

            _, errors = validate(path)

        self.assertTrue(any("nameZh" in error for error in errors))
        self.assertTrue(any("listing placeholder" in error for error in errors))


class ContentQualityTests(unittest.TestCase):
    def test_chinese_name_is_derived_from_summary(self):
        project = {
            "name": "An English Case Study",
            "summary": "智能排班工具，通过订阅制帮助门店提升效率。",
        }

        self.assertEqual(derive_chinese_name(project), "智能排班工具")

    def test_data_listing_is_not_a_project(self):
        self.assertTrue(
            is_placeholder(
                {
                    "name": "Crm marketing attri...",
                    "url": "https://www.starterstory.com/data",
                }
            )
        )


if __name__ == "__main__":
    unittest.main()
