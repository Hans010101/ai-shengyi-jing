"""Regression checks for the September 6 collection failure and source outages."""

import unittest
from unittest.mock import patch

from pipeline.scraper import discover_projects
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


if __name__ == "__main__":
    unittest.main()
