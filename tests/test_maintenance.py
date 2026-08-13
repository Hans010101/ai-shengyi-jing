import json
import tempfile
import unittest
from pathlib import Path

from pipeline.article_pipeline import normalize_article, normalize_media
from pipeline.project_store import merge_projects, project_ids
from pipeline.content_quality import derive_chinese_name, is_placeholder
from pipeline.scraper import make_id, parse_detail_html, parse_listing_html
from scripts.build_edgeone import EDGEONE_PATHS, build as build_edgeone
from scripts.build_site import PUBLISH_PATHS, build, public_output_paths
from scripts.generate_case_catalog import (
    clean_existing_media,
    ensure_visual_media,
    extract_official_media,
)
from scripts.validate_case_catalog import validate as validate_case_catalog
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


class DailyScraperTests(unittest.TestCase):
    def test_current_starter_story_table_markup_is_parsed(self):
        html = """
        <table><tbody><tr>
          <td class="business-details-col">
            <img src="https://cdn.example/cover.jpg">
            <a class="nostylelink" data-posthog-action="view_case_study"
               href="/businesses/browserless">
              <span class="text-sm font-bold">Cloud headless browser service</span>
            </a>
            <span class="font-mono">browserless.io</span>
          </td>
          <td><span>$300K/mo</span></td><td>—</td>
        </tr></tbody></table>
        """

        projects = parse_listing_html(html)

        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]["name"], "Cloud headless browser service")
        self.assertEqual(projects[0]["revenue"], "$300K/mo")
        self.assertEqual(projects[0]["slug"], "browserless")
        self.assertEqual(projects[0]["image"], "https://cdn.example/cover.jpg")
        self.assertEqual(
            projects[0]["id"],
            make_id("https://www.starterstory.com/businesses/browserless"),
        )

    def test_listing_ids_are_stable_when_display_name_changes(self):
        url = "https://www.starterstory.com/businesses/browserless"
        self.assertEqual(make_id(url), make_id(url + "/"))

    def test_business_detail_recovers_full_name_image_and_official_site(self):
        detail = parse_detail_html(
            """
            <html><head>
              <meta name="description" content="Web Browser Automation">
              <meta property="og:image" content="https://cdn.example/hero.jpg">
            </head><body>
              <h1>Browserless</h1>
              <a href="https://www.starterstory.com/data">Data</a>
              <a href="https://browserless.io">Official website</a>
            </body></html>
            """
        )

        self.assertEqual(detail["name"], "Browserless")
        self.assertEqual(detail["description"], "Web Browser Automation")
        self.assertEqual(detail["image"], "https://cdn.example/hero.jpg")
        self.assertEqual(detail["website"], "https://browserless.io")


class BuildTests(unittest.TestCase):
    def test_build_contains_only_public_files(self):
        projects = json.loads(
            Path("data/projects_live.json").read_text(encoding="utf-8")
        )
        expected_dates = {
            project["id"]: (
                project.get("scrapedAt") or project.get("updatedAt") or ""
            )[:10]
            for project in projects
            if project.get("id")
            and (project.get("scrapedAt") or project.get("updatedAt"))
        }
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temp_dir:
            output = Path(temp_dir) / "dist"
            copied = build(output, "a" * 40)
            actual = {
                path.relative_to(output)
                for path in output.rglob("*")
                if path.is_file()
            }

            deployment = json.loads(
                (output / "deployment.json").read_text(encoding="utf-8")
            )
            collection_dates = json.loads(
                (output / "data/case_collection_dates.json").read_text(
                    encoding="utf-8"
                )
            )

        self.assertEqual(set(copied), set(public_output_paths()))
        self.assertEqual(actual, set(public_output_paths()))
        self.assertNotIn(Path(".github/workflows/deploy_cloudflare.yml"), actual)
        self.assertNotIn(Path("pipeline/drafts/example.md"), actual)
        self.assertEqual(deployment["commit"], "a" * 40)
        self.assertEqual(deployment["shortCommit"], "a" * 12)
        self.assertEqual(collection_dates, expected_dates)

    def test_edgeone_wraps_the_same_static_artifact(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temp_dir:
            shared = Path(temp_dir) / "dist"
            edgeone = Path(temp_dir) / "dist-edgeone"
            build(shared, "b" * 40)
            copied = build_edgeone(shared, edgeone)

            shared_files = {
                path.relative_to(shared)
                for path in shared.rglob("*")
                if path.is_file()
            }
            edgeone_files = {
                path.relative_to(edgeone)
                for path in edgeone.rglob("*")
                if path.is_file()
            }

        self.assertEqual(copied, list(EDGEONE_PATHS))
        self.assertTrue(shared_files.issubset(edgeone_files))
        self.assertEqual(
            edgeone_files - shared_files,
            {Path("edge-functions/api/advisor.js")},
        )

    def test_public_ui_does_not_render_english_project_subtitles(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as temp_dir:
            output = Path(temp_dir) / "dist"
            build(output, "c" * 40)
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
        case_html = Path("case.html").read_text(encoding="utf-8")

        self.assertIn("case.html?id=", app_js)
        self.assertNotIn("📚 原始案例", app_js)
        self.assertIn("data/case_articles/", case_js)
        self.assertIn("article?.project", case_js)
        self.assertIn("fetchJsonIfAvailable", case_js)
        self.assertIn("content-type", case_js)
        self.assertIn("findCuratedProject(projectId)", case_js)
        self.assertLess(
            case_html.index('src="data/projects.js"'),
            case_html.index('src="assets/case.js"'),
        )
        self.assertNotIn("素材来源", case_js)
        self.assertNotIn("核验提示", case_js)
        self.assertNotIn("查看事实来源", case_js)
        self.assertNotIn("source-box", case_js)
        self.assertIn("article-media-link", case_js)
        self.assertIn("article-video-card", case_js)
        self.assertIn("media.watchUrl", case_js)
        self.assertIn("观看完整视频", case_js)
        self.assertIn("data/case_collection_dates.json", case_js)
        self.assertIn("采集：${collectionDate}", case_js)
        self.assertNotIn("更新：${String(article.generatedAt)", case_js)
        self.assertIn(Path("case.html"), PUBLISH_PATHS)
        self.assertIn(Path("data/case_articles.json"), PUBLISH_PATHS)
        self.assertIn(Path("data/case_articles"), PUBLISH_PATHS)

    def test_case_directory_is_published_and_linked_from_navigation(self):
        index_html = Path("index.html").read_text(encoding="utf-8")
        cases_html = Path("cases.html").read_text(encoding="utf-8")
        cases_js = Path("assets/cases.js").read_text(encoding="utf-8")
        cases_css = Path("assets/cases.css").read_text(encoding="utf-8")
        case_html = Path("case.html").read_text(encoding="utf-8")

        self.assertIn('href="cases.html"', index_html)
        self.assertIn('href="cases.html"', case_html)
        self.assertIn('id="caseCategoryBar"', cases_html)
        self.assertIn('id="caseSearchInput"', cases_html)
        self.assertNotIn("返回首页", cases_html)
        self.assertNotIn("directory-home", cases_html)
        self.assertNotIn("overflow-x: auto", cases_css)
        self.assertIn("grid-template-columns: repeat(6", cases_css)
        self.assertIn("grid-template-columns: repeat(4", cases_css)
        self.assertIn("grid-template-columns: repeat(2", cases_css)
        self.assertIn("case.html?id=", cases_js)
        self.assertIn("project.niche", cases_js)
        for path in (
            Path("cases.html"),
            Path("assets/cases.js"),
            Path("assets/cases.css"),
        ):
            self.assertIn(path, PUBLISH_PATHS)

    def test_homepage_visualizes_global_opportunities_and_radar_categories(self):
        index_html = Path("index.html").read_text(encoding="utf-8")
        style_css = Path("assets/style.css").read_text(encoding="utf-8")

        self.assertIn('class="hero-world-map"', index_html)
        self.assertIn('class="hero-map-metrics"', index_html)
        self.assertIn('id="hero-total-number"', index_html)
        self.assertIn('class="radar-network"', index_html)
        for category in ("AI工具", "SaaS", "电商/DTC", "内容创业", "本地生意"):
            self.assertIn(category, index_html)

        self.assertIn(".map-routes path", style_css)
        self.assertIn(".radar-node", style_css)
        self.assertIn("@media (prefers-reduced-motion: reduce)", style_css)

    def test_homepage_project_icons_follow_the_eight_filter_categories(self):
        app_js = Path("assets/app.js").read_text(encoding="utf-8")
        index_html = Path("index.html").read_text(encoding="utf-8")

        expected = {
            "AI工具": "🤖",
            "Micro SaaS": "⚡",
            "内容创业": "✍️",
            "电商品牌": "🛒",
            "服务类": "🤝",
            "知识付费": "🎓",
            "本地生意": "📍",
            "无代码": "🔧",
        }
        self.assertIn("PROJECT_CATEGORY_STYLES", app_js)
        self.assertIn("classifyProjectCategory", app_js)
        self.assertIn("categoryStyle.icon", app_js)
        self.assertIn('aria-label="${categoryName}">${categoryStyle.icon}</div>', app_js)
        for category, icon in expected.items():
            self.assertIn(f"'{category}': {{ icon: '{icon}'", app_js)
        self.assertIn("20260805-category-icons", index_html)

    def test_case_catalog_covers_every_project(self):
        report, errors = validate_case_catalog(write_report=False)

        self.assertEqual(errors, [])
        self.assertEqual(report["coveragePercent"], 100.0)
        self.assertEqual(report["articleCount"], report["projectCount"])
        self.assertGreaterEqual(report["minimumFullCharacters"], 2_400)
        self.assertEqual(report["withoutMedia"], 0)
        self.assertEqual(report["belowThreeMedia"], 0)
        self.assertGreater(report["editorialInfographics"], 0)


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
        self.assertLessEqual(len(article["sections"]), 8)
        self.assertEqual(len(article["keyFacts"]), 6)
        self.assertEqual(len(article["media"]), 5)
        self.assertEqual(article["source"]["name"], "Starter Story")

    def test_case_article_media_requires_attribution_for_source_images(self):
        media = normalize_media(
            [
                {
                    "type": "image",
                    "url": "https://assets.starterstory.com/photo.jpg",
                    "origin": "official-site",
                },
                {
                    "type": "image",
                    "url": "https://d1coqmn8qm80r4.cloudfront.net/story.jpg",
                    "sourceUrl": "https://www.starterstory.com/stories/example",
                    "origin": "source-attributed",
                    "usage": "non-commercial-attributed",
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
                    "watchUrl": "https://www.youtube.com/watch?v=1",
                    "poster": "https://i.ytimg.com/vi/1/hqdefault.jpg",
                    "provider": "YouTube",
                },
                {
                    "type": "video-file",
                    "url": "https://cdn.example.com/demo.mp4",
                    "sourceUrl": "https://example.com",
                    "origin": "official-site-video",
                },
            ]
        )

        self.assertEqual(
            [item["url"] for item in media],
            [
                "https://d1coqmn8qm80r4.cloudfront.net/story.jpg",
                "https://cdn.example.com/product.jpg",
                "https://www.youtube.com/embed/1",
                "https://cdn.example.com/demo.mp4",
            ],
        )
        youtube = media[2]
        self.assertEqual(
            youtube["watchUrl"],
            "https://www.youtube.com/watch?v=1",
        )
        self.assertEqual(youtube["provider"], "YouTube")

    def test_visual_media_supports_five_to_eight_item_enrichment(self):
        project = {
            "id": "example",
            "nameZh": "示例项目",
            "businessLoop": "内容引流 ➔ 体验转化 ➔ 付费 ➔ 复购",
            "productArch": "获客入口 ➔ 核心产品 ➔ 标准交付 ➔ 售后",
            "chinaOpportunity": "从垂直行业切入并验证付费",
            "getStartedPath": ["访谈用户", "制作样板", "完成首单"],
        }
        source_image = {
            "type": "image",
            "url": "https://cdn.example.com/product.jpg",
            "caption": "产品展示",
            "origin": "official-site",
        }

        empty = ensure_visual_media(project, [])
        one = ensure_visual_media(project, [source_image])
        six = ensure_visual_media(
            project,
            [
                {**source_image, "url": f"https://cdn.example.com/{index}.jpg"}
                for index in range(6)
            ],
            min_items=5,
            max_items=8,
        )
        enriched_one = ensure_visual_media(
            project,
            [source_image],
            min_items=5,
            max_items=8,
        )
        invalid_video = ensure_visual_media(
            project,
            [
                source_image,
                {
                    "type": "video",
                    "url": "https://www.youtube.com/embed/demo",
                    "watchUrl": "https://www.youtube.com/watch?v=demo",
                    "poster": "",
                    "caption": "产品演示",
                },
            ],
            min_items=5,
            max_items=8,
        )

        self.assertEqual(len(empty), 3)
        self.assertTrue(all(item["type"] == "infographic" for item in empty))
        self.assertEqual(len(one), 3)
        self.assertEqual(one[0]["type"], "image")
        self.assertEqual(
            [item["type"] for item in one[1:]],
            ["infographic", "infographic"],
        )
        self.assertEqual(len(six), 6)
        self.assertTrue(all(item["type"] == "image" for item in six))
        self.assertEqual(len(enriched_one), 5)
        self.assertEqual(enriched_one[0]["type"], "image")
        self.assertEqual(
            [item["type"] for item in enriched_one[1:]],
            ["infographic"] * 4,
        )
        self.assertNotIn("video", [item["type"] for item in invalid_video])
        self.assertTrue(
            all(
                "AI生意经原创信息图" in item["caption"]
                for item in empty
            )
        )

    def test_case_page_renders_editorial_infographics(self):
        case_js = Path("assets/case.js").read_text(encoding="utf-8")
        case_css = Path("assets/case.css").read_text(encoding="utf-8")

        self.assertIn("editorial-infographic", case_js)
        self.assertIn("AI生意经原创信息图", case_js)
        self.assertIn(".infographic-flow", case_css)
        self.assertIn("validation-scorecard", case_js)
        self.assertIn(".infographic-validation-scorecard", case_css)
        self.assertIn("unit-economics", case_js)
        self.assertIn(".infographic-unit-economics", case_css)

    def test_case_page_uses_editorial_navigation_and_distributed_media(self):
        case_js = Path("assets/case.js").read_text(encoding="utf-8")
        case_css = Path("assets/case.css").read_text(encoding="utf-8")
        article = json.loads(
            Path("data/case_articles/a80ee1def467.json").read_text(
                encoding="utf-8"
            )
        )

        self.assertIn("营收背后", article["title"])
        self.assertEqual(len(article["sections"]), 8)
        self.assertTrue(article["editorNote"])
        self.assertEqual(len(article["highlights"]), 4)
        self.assertTrue(
            all(section.get("kicker") for section in article["sections"])
        )
        self.assertGreaterEqual(article["quality"]["readingMinutes"], 5)
        self.assertIn("article-toc-grid", case_js)
        self.assertIn("mediaSlots", case_js)
        self.assertIn("case-opening-lead", case_js)
        self.assertIn(".article-toc-grid", case_css)
        self.assertIn(".editor-note", case_css)

    def test_daily_scrape_is_not_blocked_by_legacy_media_backfill(self):
        workflow = Path(".github/workflows/daily_scrape.yml").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("--enrich-official-batch", workflow)

    def test_case_media_batches_are_published_after_enrichment(self):
        workflow = Path(".github/workflows/case_media_batch.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("--media-batch-size", workflow)
        self.assertIn("actions: write", workflow)
        self.assertIn("gh workflow run deploy_cloudflare.yml", workflow)

    def test_official_media_prefers_product_scenes_and_playable_video(self):
        project = {
            "id": "example",
            "nameZh": "示例项目",
            "website": "https://example.com",
        }
        media = extract_official_media(
            project,
            """
            <html><head>
              <meta property="og:image" content="/social-product-preview.jpg">
            </head><body><main>
              <img alt="Example logo" src="/logo.svg">
              <section><h2>Product workflow</h2>
                <img alt="Powerful dashboard preview" src="/dashboard.png">
                <img alt="Analytics screenshot" src="/analytics.jpg">
                <img alt="Founder portrait" src="/founder.jpg">
                <video poster="/demo-cover.jpg">
                  <source src="/product-demo.mp4" type="video/mp4">
                </video>
                <video><source src="/animated-background/bg-waves.webm"></video>
              </section>
            </main></body></html>
            """,
            "https://example.com/",
        )

        urls = [item["url"] for item in media]
        self.assertIn("https://example.com/dashboard.png", urls)
        self.assertIn("https://example.com/analytics.jpg", urls)
        self.assertIn("https://example.com/product-demo.mp4", urls)
        self.assertNotIn("https://example.com/logo.svg", urls)
        self.assertNotIn("https://example.com/founder.jpg", urls)
        self.assertNotIn(
            "https://example.com/animated-background/bg-waves.webm",
            urls,
        )
        video = next(item for item in media if item["type"] == "video-file")
        self.assertEqual(video["watchUrl"], video["url"])
        self.assertEqual(video["poster"], "https://example.com/demo-cover.jpg")
        self.assertEqual(video["origin"], "official-site-video")
        self.assertTrue(all("示例项目官网" in item["caption"] for item in media))

    def test_case_page_links_official_video_to_full_file(self):
        case_js = Path("assets/case.js").read_text(encoding="utf-8")
        self.assertIn("safeExternalUrl(media.watchUrl) || mediaUrl", case_js)
        self.assertIn("观看完整视频", case_js)

    def test_existing_media_cleanup_removes_page_chrome_and_generic_captions(self):
        project = {
            "id": "example",
            "nameZh": "养蜂产蜜业务",
            "summary": "养蜂产蜜业务，通过销售蜂蜜及蜂产品盈利",
            "url": "https://www.starterstory.com/stories/example",
            "image": "https://cdn.example.com/project.jpg",
        }
        cleaned = clean_existing_media(
            project,
            [
                {
                    "type": "image",
                    "url": project["image"],
                    "caption": "养蜂产蜜业务公开案例主图",
                    "alt": "养蜂产蜜业务案例图片",
                    "origin": "source-attributed",
                },
                {
                    "type": "image",
                    "url": (
                        "https://d1coqmn8qm80r4.cloudfront.net/"
                        "production/images/cd9317a79f1c2fee"
                    ),
                    "caption": "养蜂产蜜业务项目公开展示素材",
                    "alt": "by HubSpot Media",
                    "origin": "source-attributed",
                },
                {
                    "type": "image",
                    "url": "https://d1coqmn8qm80r4.cloudfront.net/tool",
                    "caption": "养蜂产蜜业务项目公开展示素材",
                    "alt": "tool-icon",
                    "origin": "source-attributed",
                },
            ],
        )

        self.assertEqual(len(cleaned), 1)
        self.assertEqual(
            cleaned[0]["caption"],
            "养蜂产蜜业务：通过销售蜂蜜及蜂产品盈利",
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
            self.assertIn(
                article["provider"],
                {
                    "cloudflare-workers-ai",
                    "deepseek",
                    "editorial-reviewed",
                },
            )
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
                if "starterstory.com" in host or "cloudfront.net" in host:
                    self.assertEqual(media["origin"], "source-attributed")
                    self.assertEqual(
                        media["usage"],
                        "non-commercial-attributed",
                    )


if __name__ == "__main__":
    unittest.main()
