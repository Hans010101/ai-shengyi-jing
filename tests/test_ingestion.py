"""Regression checks for the September 6 collection failure and source outages."""

import unittest
import json
import tempfile
from pathlib import Path
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import patch

from pipeline import scraper
from pipeline.scraper import discover_projects
from scripts.check_automation import recovery_action, verify_site, check_source_coverage
from scripts.build_site import build_project_index
from scripts import generate_case_catalog as catalog
from scripts.generate_case_catalog import (
    build_structured_article,
    ensure_visual_media,
    extract_official_media,
)
from scripts.validate_case_catalog import BAD_MEDIA_TEXT


class MediaIngestionTests(unittest.TestCase):
    def test_castmagic_customer_logos_do_not_become_product_images(self):
        project = {"id": "61582a0845fb", "nameZh": "音视频内容转化工具"}
        media = extract_official_media(project, """
            <main><h2>AI content creation platform</h2>
              <img src="/hero-logos/yahoo_sports.webp" alt="Content creators">
              <img src="/hero-logos/hubspot.webp" alt="Content creators">
              <img src="/hero-logos/hubspot_creators.webp" alt="Content creators">
              <img src="/customer_logo.webp" alt="Product partners">
              <img src="/tool-icon.webp" alt="Product tools">
              <img src="/product-dashboard.webp" alt="Content editing dashboard">
            </main>
        """, "https://www.castmagic.io/")
        self.assertEqual([item["url"] for item in media], [
            "https://www.castmagic.io/product-dashboard.webp",
        ])
        article = build_structured_article(project, media)
        self.assertEqual(len(article["media"]), 3)
        self.assertEqual(article["media"][0], media[0])
        self.assertTrue(all(item["type"] == "infographic" for item in article["media"][1:]))

    def test_final_media_gate_matches_publication_rules_on_every_field(self):
        project = {"id": "example", "nameZh": "示例项目"}
        good = {"type": "image", "url": "https://example.com/product.jpg", "caption": "产品界面"}
        for field in ("url", "alt", "caption"):
            for marker in ("hubspot", "tool-icon", "youtube-logo", "starter-avatar", "5 stars"):
                with self.subTest(field=field, marker=marker):
                    bad = {**good, field: f"https://example.com/{marker}.webp"}
                    media = ensure_visual_media(project, [bad, good])
                    self.assertEqual(len(media), 3)
                    self.assertEqual(media[0], good)
                    self.assertTrue(all(item["type"] == "infographic" for item in media[1:]))
                    for item in media:
                        self.assertIsNone(BAD_MEDIA_TEXT.search(" ".join(
                            str(item.get(key, "")) for key in ("url", "alt", "caption")
                        )))


class DiscoveryResilienceTests(unittest.TestCase):
    def test_either_source_can_cover_a_temporary_outage(self):
        project = {"id": "example", "url": "https://www.starterstory.com/businesses/example"}
        for failed in ("listing", "sitemap"):
            with self.subTest(failed=failed), \
                 patch("pipeline.scraper.scrape_listing_page") as listing, \
                 patch("pipeline.scraper.scrape_sitemap_businesses") as sitemap:
                sources = {"listing": listing, "sitemap": sitemap}
                for name, source in sources.items():
                    if name == failed:
                        source.side_effect = RuntimeError("temporary outage")
                    else:
                        source.return_value = [project]
                projects, health = discover_projects()
                self.assertEqual(projects, [project])
                self.assertEqual(health["status"], "degraded")
                self.assertEqual(health["sourceErrors"], {failed: "temporary outage"})

    def test_both_failed_sources_stop_publication(self):
        with patch("pipeline.scraper.scrape_listing_page", side_effect=RuntimeError("listing outage")), \
             patch("pipeline.scraper.scrape_sitemap_businesses", side_effect=RuntimeError("sitemap outage")):
            with self.assertRaisesRegex(RuntimeError, "All discovery sources failed"):
                discover_projects()

    def test_healthy_sources_are_combined_without_duplicate_ids(self):
        listing = {"id": "example", "name": "Listing title"}
        sitemap = {"id": "example", "name": "Sitemap title"}
        extra = {"id": "sitemap-only"}
        with patch("pipeline.scraper.scrape_listing_page", return_value=[listing]), \
             patch("pipeline.scraper.scrape_sitemap_businesses", return_value=[sitemap, extra]):
            projects, health = discover_projects()
            self.assertEqual(projects, [listing, extra])
            self.assertEqual(health["status"], "healthy")
            self.assertEqual(health["sourceErrors"], {})


class UnattendedRecoveryTests(unittest.TestCase):
    analysis = {
        "nameZh": "测试产品", "summary": "测试摘要", "insight": "产品洞察",
        "businessModel": "订阅服务", "chinaOpportunity": "本土分析",
        "productArch": "输入处理交付", "businessLoop": "获客使用付费",
        "getStartedPath": ["验证需求", "搭建原型", "验证付费"],
    }

    def test_story_metadata_and_content_hash_ignore_timestamp_only_changes(self):
        detail = scraper.parse_detail_html('''<h1>AI Support Making $500/Month</h1>
          <meta name="description" content="A founder support product">
          <link rel="canonical" href="https://www.starterstory.com/stories/support">
          <script type="application/ld+json">{"@type":"Article","datePublished":"2026-09-23"}</script>
          <nav><a href="https://sponsor.example/promo">Sponsor</a></nav>
          <article><a href="https://go.starterstory.com/hs-main-nav">Promotion</a>
          <a href="https://www.twitter.com/founder">Founder social</a>
          <a href="https://support.example">Product</a>
          <p>A founder built a support agent for small teams, charging subscriptions for hosted support.</p></article>''')
        self.assertEqual(detail["sourcePublishedAt"], "2026-09-23")
        self.assertEqual(detail["revenueDetail"], "$500/Month")
        self.assertEqual(detail["website"], "https://support.example")
        self.assertIn("subscriptions", detail["sourceText"])
        self.assertEqual(scraper.source_fingerprint(detail), scraper.source_fingerprint({**detail, "sourceUpdatedAt": "tomorrow"}))
        self.assertNotEqual(scraper.source_fingerprint(detail), scraper.source_fingerprint({**detail, "sourceText": "changed"}))

    def test_batch_preserves_backlog_and_unchanged_refresh_skips_ai(self):
        detail = {"name": "Old", "description": "Original public facts", "revenueDetail": "$1K/mo"}
        old = {"id": "old", "url": "https://www.starterstory.com/stories/old", "name": "Old", "sourceUpdatedAt": "2026-09-01", "sourceFingerprint": scraper.source_fingerprint(detail)}
        new = [{"id": f"new{i}", "name": f"New {i}", "revenue": "$1K/mo"} for i in range(3)]
        source = {**old, "sourceUpdatedAt": "2026-09-26"}
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root = Path(directory)
            for key, path in {"DATA_DIR": root, "OUTPUT_FILE": root / "projects.json", "SEEN_FILE": root / "seen.json", "PENDING_FILE": root / "pending.json", "REFRESH_FILE": root / "refresh.json", "HEALTH_FILE": root / "health.json"}.items():
                stack.enter_context(patch.object(scraper, key, path))
            scraper.OUTPUT_FILE.write_text(json.dumps([old]))
            stack.enter_context(patch.object(scraper, "NEW_BATCH_SIZE", 1))
            stack.enter_context(patch.object(scraper, "discover_projects", return_value=(new + [source], {"sourceErrors": {}})))
            stack.enter_context(patch.object(scraper, "scrape_detail_page", return_value=detail))
            analyze = stack.enter_context(patch.object(scraper, "generate_chinese_analysis", return_value=self.analysis))
            stack.enter_context(patch.object(scraper, "generate_content_drafts"))
            stack.enter_context(patch.object(scraper.time, "sleep"))
            scraper.run_pipeline()
            self.assertEqual(analyze.call_count, 1)
            self.assertEqual(len(json.loads(scraper.PENDING_FILE.read_text())), 2)
            self.assertEqual(json.loads(scraper.REFRESH_FILE.read_text()), [])
            health = json.loads(scraper.HEALTH_FILE.read_text())
            self.assertEqual((health["queuedProjects"], health["pendingProjects"], health["status"]), (2, 0, "healthy"))
            stored = json.loads(scraper.OUTPUT_FILE.read_text())
            self.assertEqual(stored[-1]["sourceUpdatedAt"], "2026-09-26")

    def test_changed_article_failure_restores_both_published_versions(self):
        old = {"id": "old", "summary": "previous"}
        update = {"id": "old", "summary": "changed"}
        article = {"projectId": "old", "title": "Original"}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(catalog, "ROOT", root), \
                 patch.object(catalog, "PROJECTS_FILE", root / "projects.json"), \
                 patch.object(catalog, "ARTICLES_DIR", root / "articles"), \
                 patch("scripts.validate_case_catalog.validate", return_value=({}, ["old: invalid English edition"])):
                kept = catalog.finalize_refreshes([update], [old], {"old": article}, {"old"}, {})
                self.assertEqual(kept, [old])
                self.assertEqual(json.loads((root / "articles/old.json").read_text()), article)
                self.assertEqual(json.loads((root / "pipeline/data/pending_projects.json").read_text()), [update])
                self.assertEqual(json.loads((root / "pipeline/data/refresh_projects.json").read_text()), [])

    def test_independent_probe_detects_parser_omitting_stories(self):
        response = SimpleNamespace(content=b'<urlset><url><loc>https://www.starterstory.com/stories/new</loc></url></urlset>')
        with patch.object(scraper, "fetch_response", return_value=response), \
             patch.object(scraper, "parse_sitemap_xml", return_value=[]):
            with self.assertRaisesRegex(ValueError, "URL"):
                check_source_coverage([])

    def test_ai_retries_then_uses_next_configured_provider(self):
        with patch.object(scraper, "DEEPSEEK_API_KEY", "configured"), \
             patch.object(scraper, "GEMINI_API_KEY", "configured"), \
             patch.object(scraper, "call_deepseek", return_value={}) as primary, \
             patch.object(scraper, "call_gemini", return_value={**self.analysis, "id": "malicious"}), \
             patch.object(scraper.time, "sleep"):
            result = scraper.generate_chinese_analysis({"id": "original"})
            self.assertEqual(primary.call_count, 2)
            self.assertEqual(result, self.analysis)

    def test_missing_keys_never_publish_placeholder_analysis(self):
        with patch.object(scraper, "DEEPSEEK_API_KEY", ""), \
             patch.object(scraper, "GEMINI_API_KEY", ""), \
             patch.object(scraper, "OPENAI_API_KEY", ""):
            with self.assertRaises(RuntimeError):
                scraper.generate_chinese_analysis({"id": "new"})

    def test_bad_project_is_retained_and_recovered_even_after_leaving_listing(self):
        good = {"id": "good", "name": "Good", "revenue": "$1K/mo"}
        bad = {"id": "bad", "name": "Bad", "revenue": "$2K/mo"}
        health = {"status": "healthy", "sourceErrors": {}}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(scraper, "DATA_DIR", root), \
                 patch.object(scraper, "SEEN_FILE", root / "seen.json"), \
                 patch.object(scraper, "PENDING_FILE", root / "pending.json"), \
                 patch.object(scraper, "REFRESH_FILE", root / "refresh.json"), \
                 patch.object(scraper, "HEALTH_FILE", root / "health.json"), \
                 patch.object(scraper, "OUTPUT_FILE", root / "projects.json"), \
                 patch.object(scraper, "discover_projects", return_value=([good, bad], health)) as discover, \
                 patch.object(scraper, "generate_chinese_analysis", side_effect=[self.analysis, RuntimeError("API outage")]) as analyze, \
                 patch.object(scraper, "generate_content_drafts"), \
                 patch.object(scraper.time, "sleep"):
                scraper.run_pipeline()
                self.assertEqual(json.loads((root / "pending.json").read_text())[0]["id"], "bad")
                self.assertEqual(json.loads((root / "seen.json").read_text()), ["good"])
                report = json.loads((root / "health.json").read_text())
                self.assertEqual((report["databaseProjects"], report["pendingProjects"]), (1, 1))
                self.assertEqual(report["status"], "degraded")
                discover.return_value = ([], health)
                analyze.side_effect = [self.analysis]
                scraper.run_pipeline()
                self.assertEqual(json.loads((root / "pending.json").read_text()), [])
                self.assertEqual(len(json.loads((root / "projects.json").read_text())), 2)
                report = json.loads((root / "health.json").read_text())
                self.assertEqual((report["databaseProjects"], report["status"], report["phase"]), (2, "healthy", "complete"))

    def test_retry_is_bounded_and_does_not_override_active_or_newer_success(self):
        failed = {"status": "completed", "conclusion": "failure", "run_attempt": 1}
        self.assertEqual(recovery_action([failed])[0], "retry")
        self.assertEqual(recovery_action([{**failed, "run_attempt": 3}])[0], "alert")
        self.assertEqual(recovery_action([{**failed, "status": "in_progress"}])[0], "wait")
        self.assertEqual(recovery_action([{**failed, "conclusion": "success"}, failed])[0], "ok")
        self.assertEqual(recovery_action([{**failed, "conclusion": "cancelled"}])[0], "alert")

    def test_bad_new_article_is_quarantined_without_removing_historical_cases(self):
        projects = [{"id": "old"}, {"id": "new"}, {"id": "good"}]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            articles = root / "articles"
            articles.mkdir()
            for project in projects:
                (articles / f"{project['id']}.json").write_text("{}")
            with patch.object(catalog, "ROOT", root), \
                 patch.object(catalog, "PROJECTS_FILE", root / "projects.json"), \
                 patch.object(catalog, "ARTICLES_DIR", articles), \
                 patch("scripts.validate_case_catalog.validate", return_value=({}, ["new: invalid media", "old: existing problem"])):
                catalog.isolate_new_failures(projects, {"new", "good"}, {})
                self.assertEqual(json.loads((root / "projects.json").read_text()), [{"id": "old"}, {"id": "good"}])
                self.assertTrue((articles / "old.json").exists())
                self.assertFalse((articles / "new.json").exists())
                self.assertEqual(json.loads((root / "pipeline/data/pending_projects.json").read_text()), [{"id": "new"}])

    def test_live_check_rejects_stale_index_wrong_commit_and_missing_english_detail(self):
        projects = [{"id": "new", "nameZh": "新项目"}]
        article = {"projectId": "new", "translations": {"en": {"title": "New"}}}
        index = build_project_index(projects)
        for responses in ([{"commit": "old"}], [{"commit": "new"}, []],
                          [{"commit": "new"}, index, {"projectId": "new"}]):
            with self.subTest(responses=responses), \
                 patch("scripts.check_automation.remote_json", side_effect=responses), \
                 patch("scripts.check_automation.read_json", return_value=article):
                with self.assertRaises(ValueError):
                    verify_site("https://example.com", projects, "new")
        with patch("scripts.check_automation.remote_json", side_effect=[{"commit": "new"}, index, article]), \
             patch("scripts.check_automation.read_json", return_value=article):
            verify_site("https://example.com", projects, "new")


if __name__ == "__main__":
    unittest.main()
