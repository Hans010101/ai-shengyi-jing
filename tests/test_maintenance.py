import json
import tempfile
import unittest
from pathlib import Path

from pipeline.article_pipeline import normalize_article, normalize_media
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

    def test_case_details_are_published_inside_the_site(self):
        app_js = Path("assets/app.js").read_text(encoding="utf-8")
        case_js = Path("assets/case.js").read_text(encoding="utf-8")

        self.assertIn("case.html?id=", app_js)
        self.assertNotIn("📚 原始案例", app_js)
        self.assertIn("data/case_articles.json", case_js)
        self.assertIn("查看事实来源", case_js)
        self.assertIn(Path("case.html"), PUBLISH_PATHS)
        self.assertIn(Path("data/case_articles.json"), PUBLISH_PATHS)


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

    def test_case_article_normalization_bounds_sections_and_media(self):
        project = {
            "id": "example",
            "nameZh": "示例项目",
            "url": "https://www.starterstory.com/stories/example",
            "website": "https://example.com",
        }
        generated = {
            "title": "示例文章",
            "dek": "摘要",
            "opening": "开篇",
            "keyFacts": [{"label": "模式", "value": "订阅"}] * 8,
            "sections": [
                {
                    "heading": f"章节{i}",
                    "paragraphs": ["正文"],
                    "callout": "",
                }
                for i in range(9)
            ],
            "conclusion": "结论",
            "riskNote": "风险",
        }

        article = normalize_article(
            project,
            generated,
            "cloudflare-workers-ai",
            [
                {
                    "type": "image",
                    "url": "https://example.com/a.jpg",
                    "sourceUrl": "https://example.com",
                    "origin": "official-site",
                }
            ]
            * 6,
        )

        self.assertGreaterEqual(len(article["sections"]), 5)
        self.assertLessEqual(len(article["sections"]), 7)
        self.assertEqual(len(article["keyFacts"]), 6)
        self.assertEqual(len(article["media"]), 4)
        self.assertEqual(article["source"]["name"], "Starter Story")

    def test_case_article_media_rejects_source_images_and_unapproved_embeds(self):
        media = normalize_media(
            [
                {
                    "type": "image",
                    "url": "https://assets.starterstory.com/photo.jpg",
                    "origin": "official-site",
                },
                {
                    "type": "image",
                    "url": "https://cdn.example.com/product.jpg",
                    "sourceUrl": "https://example.com",
                    "origin": "official-site",
                },
                {
                    "type": "video",
                    "url": "https://example.com/embed/1",
                    "origin": "embeddable-video",
                },
                {
                    "type": "video",
                    "url": "https://www.youtube.com/embed/1",
                    "sourceUrl": "https://www.youtube.com/watch?v=1",
                    "origin": "embeddable-video",
                },
            ]
        )

        self.assertEqual(
            [item["url"] for item in media],
            [
                "https://cdn.example.com/product.jpg",
                "https://www.youtube.com/embed/1",
            ],
        )

    def test_pilot_articles_have_required_editorial_and_source_fields(self):
        projects = {
            project["id"]
            for project in json.loads(
                Path("data/projects_live.json").read_text(encoding="utf-8")
            )
        }
        articles = json.loads(
            Path("data/case_articles.json").read_text(encoding="utf-8")
        )

        self.assertGreaterEqual(len(articles), 3)
        self.assertLessEqual(len(articles), 10)
        for article in articles:
            self.assertIn(article["projectId"], projects)
            self.assertIn(article["provider"], {"cloudflare-workers-ai", "deepseek"})
            self.assertGreaterEqual(len(article["sections"]), 5)
            self.assertTrue(article["opening"])
            self.assertTrue(article["conclusion"])
            self.assertTrue(article["riskNote"])
            self.assertTrue(
                article["source"]["url"].startswith(
                    "https://www.starterstory.com/"
                )
            )
            for media in article.get("media", []):
                host = (media.get("url") or "").lower()
                self.assertNotIn("starterstory.com", host)
                self.assertNotIn("cloudfront.net", host)


if __name__ == "__main__":
    unittest.main()
