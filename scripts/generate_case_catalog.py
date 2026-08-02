#!/usr/bin/env python3
"""Generate one rich, lazy-loaded case article for every project.

The generator preserves manually reviewed articles, builds grounded Chinese
editorial pages from the existing structured project facts, and optionally
discovers publicly embeddable images/videos from the original public page.
It never bypasses access controls and does not download third-party media.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import functools
import hashlib
import json
import re
import threading
import time
from collections import Counter
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parent.parent
PROJECTS_FILE = ROOT / "data" / "projects_live.json"
LEGACY_ARTICLES_FILE = ROOT / "data" / "case_articles.json"
ARTICLES_DIR = ROOT / "data" / "case_articles"
REPORT_FILE = ROOT / "pipeline" / "data" / "case_catalog_report.json"
SOURCE_HOST = "www.starterstory.com"
MAX_MEDIA = 5
MAX_SOURCE_IMAGES = 4
REQUEST_TIMEOUT = 25
GENERIC_CAPTION_MARKERS = (
    "项目公开展示素材",
    "公开案例主图",
    "项目相关公开视频",
)
BAD_IMAGE_TEXT = re.compile(
    r"hubspot|tool[- ]?icon|youtube[- ]?(?:icon|logo)|"
    r"(?:icon|logo)[- ]?youtube|avatar|5 stars|starter-avatar",
    re.I,
)
OFFICIAL_BAD_MEDIA_TEXT = re.compile(
    r"\b(?:logo|icon|favicon|avatar|portrait|headshot|badge|rating|stars?|"
    r"testimonial|signature|emoji|sprite|trust[-_ ]?logo|customer[-_ ]?logo)\b|"
    r"simpleicons\.org|producthunt\.com/widgets|facebook\.com/tr|"
    r"/customers?/|/platform/.+logo",
    re.I,
)
OFFICIAL_MEDIA_SIGNALS = re.compile(
    r"dashboard|screenshot|screen[-_ ]?shot|preview|product|interface|"
    r"workflow|feature|platform|editor|challenge|mockup|analytics|"
    r"automation|monitor|logging|feedback|calendar|publish|campaign|"
    r"social|portfolio|builder|simulation|hero|demo|community",
    re.I,
)
BAD_IMAGE_URLS = {
    "https://d1coqmn8qm80r4.cloudfront.net/production/images/cd9317a79f1c2fee",
}

HEADERS = {
    "User-Agent": (
        "AIShengYiJingEditorialBot/2.0 "
        "(public metadata and embeddable media discovery)"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.8",
}

_thread_local = threading.local()
_request_lock = threading.Lock()
_next_request_at = 0.0
_request_interval = 0.0
_request_retries = 0


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def clean_text(value, limit: int = 1_200) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def session() -> requests.Session:
    current = getattr(_thread_local, "session", None)
    if current is None:
        current = requests.Session()
        current.headers.update(HEADERS)
        _thread_local.session = current
    return current


def configure_source_requests(interval: float, retries: int) -> None:
    """Configure polite process-wide pacing for public source requests."""
    global _request_interval, _request_retries, _next_request_at
    _request_interval = max(0.0, interval)
    _request_retries = max(0, retries)
    _next_request_at = 0.0


def paced_source_get(url: str) -> requests.Response:
    """Fetch a source page with shared throttling and bounded 429 retries."""
    global _next_request_at
    last_response = None
    for attempt in range(_request_retries + 1):
        with _request_lock:
            delay = max(0.0, _next_request_at - time.monotonic())
            if delay:
                time.sleep(delay)
            _next_request_at = time.monotonic() + _request_interval
        last_response = session().get(url, timeout=REQUEST_TIMEOUT)
        if last_response.status_code != 429 or attempt == _request_retries:
            return last_response
        retry_after = last_response.headers.get("Retry-After", "")
        try:
            backoff = float(retry_after)
        except ValueError:
            backoff = 4.0 * (2**attempt)
        time.sleep(min(max(backoff, 2.0), 45.0))
    return last_response


def source_image(
    project: dict,
    url: str,
    caption: str,
    alt: str,
    context: str = "project-hero",
) -> dict:
    return {
        "type": "image",
        "url": url,
        "caption": caption,
        "alt": alt,
        "sourceUrl": project.get("url", ""),
        "origin": "source-attributed",
        "usage": "non-commercial-attributed",
        "context": context,
    }


def project_media_caption(project: dict) -> str:
    name = clean_text(project.get("nameZh") or project.get("name"), 80)
    summary = clean_text(project.get("summary"), 140).rstrip("。")
    for prefix in (f"{name}，", f"{name}：", name):
        if summary.startswith(prefix):
            summary = summary[len(prefix):].lstrip("，： ")
            break
    if summary:
        return f"{name}：{summary}"
    return f"{name}的核心产品与品牌主视觉"


def valid_project_image(url: str) -> bool:
    parsed = urlparse(clean_text(url, 2_000))
    return (
        parsed.scheme in {"http", "https"}
        and parsed.hostname not in {None, "api.placid.app"}
        and clean_text(url, 2_000) not in BAD_IMAGE_URLS
    )


def meaningful_alt(value: str) -> str:
    alt = clean_text(value, 140)
    if (
        not alt
        or BAD_IMAGE_TEXT.search(alt)
        or re.fullmatch(r"[\w-]+", alt)
        or alt.lower() in {"image", "photo", "screenshot"}
    ):
        return ""
    return alt


def section_context(element) -> str:
    heading = element.find_previous(["h2", "h3"])
    text = clean_text(heading.get_text(" ", strip=True) if heading else "", 180)
    rules = (
        (r"backstory|come up with|idea", "创业起点与创意来源"),
        (r"design|prototyp|manufactur|first product", "产品设计与早期打磨"),
        (r"launch", "产品上线与首次发布"),
        (r"attract|retain|customer|growth", "获客渠道与客户留存"),
        (r"today|future", "当前经营状态与下一步规划"),
        (r"learned|helpful|advantage", "创业复盘与关键经验"),
        (r"platform|tools", "业务工具与运营系统"),
        (r"books|podcasts|resources", "学习方法与行业资源"),
        (r"advice", "给创业者的实践建议"),
        (r"hire|team", "团队建设与人才需求"),
    )
    for pattern, label in rules:
        if re.search(pattern, text, re.I):
            return label
    return "创始人、核心产品与品牌起点"


def source_image_caption(project: dict, element, ordinal: int) -> str:
    name = clean_text(project.get("nameZh") or project.get("name"), 80)
    context = section_context(element)
    alt = meaningful_alt(element.get("alt"))
    if alt and re.search(r"[\u4e00-\u9fff]", alt):
        return f"{name}：{alt}"
    suffix = f"（第{ordinal}张）" if ordinal > 1 else ""
    return f"{name}：{context}相关原始配图{suffix}"


def youtube_video_id(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
        if parsed.path.startswith("/embed/"):
            return parsed.path.split("/")[2]
        return parse_qs(parsed.query).get("v", [""])[0]
    if host == "youtu.be":
        return parsed.path.strip("/").split("/")[0]
    return ""


def normalized_embed(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
        if parsed.path.startswith("/embed/"):
            video_id = parsed.path.split("/")[2]
        else:
            video_id = parse_qs(parsed.query).get("v", [""])[0]
        return f"https://www.youtube.com/embed/{video_id}" if video_id else ""
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
        return f"https://www.youtube.com/embed/{video_id}" if video_id else ""
    if host in {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}:
        match = re.search(r"(?:/video)?/(\d+)", parsed.path)
        return (
            f"https://player.vimeo.com/video/{match.group(1)}"
            if match
            else ""
        )
    return ""


def video_watch_url(embed: str) -> str:
    video_id = youtube_video_id(embed)
    if video_id:
        return f"https://www.youtube.com/watch?v={video_id}"
    parsed = urlparse(embed)
    if (parsed.hostname or "").lower() == "player.vimeo.com":
        match = re.search(r"/video/(\d+)", parsed.path)
        if match:
            return f"https://vimeo.com/{match.group(1)}"
    return ""


@functools.lru_cache(maxsize=256)
def public_video_metadata(embed: str) -> dict:
    watch_url = video_watch_url(embed)
    video_id = youtube_video_id(embed)
    metadata = {
        "watchUrl": watch_url,
        "poster": (
            f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
            if video_id
            else ""
        ),
        "title": "",
        "provider": "YouTube" if video_id else "Vimeo",
    }
    if not watch_url:
        return metadata
    endpoint = (
        "https://www.youtube.com/oembed"
        if video_id
        else "https://vimeo.com/api/oembed.json"
    )
    try:
        response = session().get(
            endpoint,
            params={"url": watch_url, "format": "json"},
            timeout=12,
        )
        response.raise_for_status()
        payload = response.json()
        metadata["title"] = clean_text(payload.get("title"), 180)
        metadata["poster"] = clean_text(
            payload.get("thumbnail_url") or metadata["poster"],
            2_000,
        )
    except (requests.RequestException, ValueError):
        pass
    return metadata


def video_item(project: dict, element, embed: str) -> dict:
    name = clean_text(project.get("nameZh") or project.get("name"), 80)
    metadata = public_video_metadata(embed)
    link_text = clean_text(element.get_text(" ", strip=True), 120)
    title = metadata["title"] or link_text
    caption = (
        f"{name}资料中提及的视频：{title}"
        if title
        else f"{name}：{section_context(element)}相关视频"
    )
    return {
        "type": "video",
        "url": embed,
        "watchUrl": metadata["watchUrl"],
        "caption": caption,
        "alt": title or f"{name}相关视频",
        "sourceUrl": project.get("url", ""),
        "origin": "embeddable-video",
        "poster": metadata["poster"],
        "provider": metadata["provider"],
        "usage": "",
    }


def official_media_description(value: str) -> str:
    """Turn common official-site media semantics into concise Chinese labels."""
    rules = (
        (r"design mockup|mobile site|code editor", "设计稿、移动端页面与代码编辑器"),
        (r"landing page.+dashboard|full[- ]stack", "全栈项目与数据看板练习界面"),
        (r"landing page|desktop.+mobile", "桌面端与移动端项目成果"),
        (r"ai chat|ai tool", "AI辅助代码编辑与作品集构建界面"),
        (r"hiring|developer profile|skills assessment", "开发者技能评估与人才筛选界面"),
        (r"teams? platform|project management", "团队项目管理界面"),
        (r"remote logging", "远程日志监控功能界面"),
        (r"error monitoring", "错误监控与问题定位界面"),
        (r"user feedback", "用户反馈收集与处理界面"),
        (r"dashboard", "产品后台与数据看板"),
        (r"analytics|simulation|portfolio builder", "数据分析与决策功能界面"),
        (r"social media|campaign|creator", "社交媒体内容与营销活动场景"),
        (r"calendar|publish|schedule", "内容排期与发布管理界面"),
        (r"community", "用户社区与产品使用场景"),
        (r"preview|product|interface|platform|feature", "产品界面与核心功能展示"),
        (r"hero|demo", "官网展示的产品主场景"),
    )
    for pattern, label in rules:
        if re.search(pattern, value, re.I):
            return label
    return "官网展示的产品与实际使用场景"


def official_media_caption(project: dict, element, fallback_text: str = "") -> str:
    name = clean_text(project.get("nameZh") or project.get("name"), 80)
    heading = element.find_previous(["h2", "h3"]) if element else None
    context = " ".join(
        (
            clean_text(element.get("alt"), 180) if element else "",
            clean_text(element.get("title"), 180) if element else "",
            clean_text(heading.get_text(" ", strip=True), 180) if heading else "",
            clean_text(fallback_text, 240),
        )
    )
    return f"{name}官网：{official_media_description(context)}"


def official_image_item(
    project: dict,
    url: str,
    element,
    page_url: str,
    fallback_text: str = "",
) -> dict:
    caption = official_media_caption(project, element, fallback_text)
    return {
        "type": "image",
        "url": url,
        "caption": caption,
        "alt": caption,
        "sourceUrl": page_url,
        "origin": "official-site",
        "usage": "official-site-reference",
        "context": "official-product",
    }


def official_video_file_item(
    project: dict,
    url: str,
    poster: str,
    element,
    page_url: str,
) -> dict:
    caption = official_media_caption(project, element, "product demo video")
    return {
        "type": "video-file",
        "url": url,
        "watchUrl": url,
        "poster": poster,
        "caption": caption,
        "alt": caption,
        "sourceUrl": page_url,
        "origin": "official-site-video",
        "usage": "official-site-reference",
        "context": "official-product-video",
    }


def candidate_image_url(element, page_url: str) -> str:
    srcset = element.get("srcset") or element.get("data-srcset") or ""
    if srcset:
        candidate = srcset.split(",")[-1].strip().split(" ")[0]
        if candidate and not candidate.startswith("data:"):
            return urljoin(page_url, candidate)
    for attribute in ("src", "data-src", "data-lazy-src"):
        value = element.get(attribute)
        if value and not value.startswith("data:"):
            return urljoin(page_url, value)
    return ""


def normalize_official_asset_url(url: str) -> str:
    """Prefer the original asset over tiny blurred CMS placeholders."""
    parsed = urlparse(url)
    if parsed.hostname == "static.wixstatic.com":
        match = re.match(
            r"^(/media/[^/]+~mv2\.(?:png|jpe?g|webp|avif))(?:/.*)?$",
            parsed.path,
            re.I,
        )
        if match:
            return f"{parsed.scheme}://{parsed.hostname}{match.group(1)}"
    return url


def official_image_score(element, image_url: str, is_social_image: bool = False) -> int:
    """Score useful product visuals and aggressively reject page chrome."""
    parsed = urlparse(image_url)
    alt = clean_text(element.get("alt"), 200) if element else ""
    title = clean_text(element.get("title"), 160) if element else ""
    classes = clean_text(" ".join(element.get("class", [])), 200) if element else ""
    heading = element.find_previous(["h2", "h3"]) if element else None
    heading_text = clean_text(heading.get_text(" ", strip=True), 200) if heading else ""
    direct_text = " ".join((alt, title, classes, parsed.path, parsed.query))
    text = " ".join((direct_text, heading_text))
    if (
        parsed.scheme not in {"http", "https"}
        or OFFICIAL_BAD_MEDIA_TEXT.search(text)
        or parsed.path.lower().endswith(".svg")
        or re.search(
            r"/(?:bg|background)[-_]|[-_](?:bg|background)[-_.]",
            parsed.path,
            re.I,
        )
    ):
        return -1
    try:
        width = int(element.get("width") or 0) if element else 0
        height = int(element.get("height") or 0) if element else 0
    except (TypeError, ValueError):
        width = height = 0
    if width and height and width < 240 and height < 160:
        return -1
    score = 80 if is_social_image else 0
    if OFFICIAL_MEDIA_SIGNALS.search(direct_text):
        score += 100
    elif OFFICIAL_MEDIA_SIGNALS.search(heading_text):
        score += 20
    if meaningful_alt(alt):
        score += 30
    if element and element.find_parent(["main", "article", "section"]):
        score += 12
    if re.search(r"hero|dashboard|screenshot|feature|product", image_url, re.I):
        score += 30
    return score if score >= 70 else -1


def extract_official_media(
    project: dict,
    html: str,
    page_url: str,
) -> list[dict]:
    """Extract a small set of semantic product images and playable videos."""
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[tuple[int, int, dict]] = []
    order = 0

    social = soup.select_one(
        "meta[property='og:image'], meta[property='og:image:secure_url'], "
        "meta[name='twitter:image'], meta[name='twitter:image:src']"
    )
    social_url = (
        normalize_official_asset_url(
            urljoin(page_url, social.get("content", ""))
        )
        if social
        else ""
    )
    if social_url:
        score = official_image_score(None, social_url, True)
        if score >= 0:
            candidates.append(
                (
                    score,
                    order,
                    official_image_item(
                        project,
                        social_url,
                        None,
                        page_url,
                        "official product preview",
                    ),
                )
            )
            order += 1

    # Product sections are frequently rendered outside <main> by CMS themes.
    # Scan the body and rely on semantic scoring to exclude navigation chrome.
    root = soup.find("body") or soup
    for image in root.select("img"):
        image_url = normalize_official_asset_url(
            candidate_image_url(image, page_url)
        )
        if not image_url:
            continue
        score = official_image_score(image, image_url)
        if score < 0:
            continue
        candidates.append(
            (
                score,
                order,
                official_image_item(project, image_url, image, page_url),
            )
        )
        order += 1

    for video in root.select("video"):
        source = video.get("src")
        if not source:
            source_node = video.select_one("source[src]")
            source = source_node.get("src") if source_node else ""
        video_url = urljoin(page_url, source or "")
        if not re.search(r"\.(?:mp4|webm)(?:$|[?#])", video_url, re.I):
            continue
        if re.search(
            r"(?:animated[-_ ]?background|(?:^|[/_-])bg[-_]|"
            r"waves?|ambient|texture|decorative)",
            video_url,
            re.I,
        ):
            continue
        poster = urljoin(page_url, video.get("poster") or social_url)
        candidates.append(
            (
                145,
                order,
                official_video_file_item(
                    project,
                    video_url,
                    poster,
                    video,
                    page_url,
                ),
            )
        )
        order += 1

    for element in root.select("iframe[src], iframe[data-src], a[href]"):
        value = element.get("src") or element.get("data-src") or element.get("href") or ""
        embed = normalized_embed(urljoin(page_url, value))
        if not embed or not video_watch_url(embed):
            continue
        item = video_item(project, element, embed)
        item["sourceUrl"] = page_url
        item["usage"] = "official-site-reference"
        item["context"] = "official-product-video"
        candidates.append((150, order, item))
        order += 1

    result = []
    seen = set()
    for _, _, item in sorted(candidates, key=lambda row: (-row[0], row[1])):
        key = canonical_media_url(item.get("url", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(item)
        if len(result) >= 4:
            break
    return result


def discover_official_media(project: dict) -> tuple[list[dict], str]:
    website = clean_text(project.get("website"), 2_000)
    parsed = urlparse(website)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return [], "website-missing"
    try:
        response = session().get(website, timeout=REQUEST_TIMEOUT)
        if response.status_code in {401, 403, 429}:
            return [], f"http-{response.status_code}"
        response.raise_for_status()
    except requests.RequestException as error:
        return [], type(error).__name__
    media = extract_official_media(project, response.text, response.url)
    return media, "ok" if media else "no-semantic-media"


def discover_source_media(project: dict) -> tuple[list[dict], str]:
    """Discover public images and explicitly embeddable videos."""
    media: list[dict] = []
    seen: set[str] = set()
    name = clean_text(project.get("nameZh") or project.get("name"), 80)
    project_image = clean_text(project.get("image"), 2_000)
    if project_image and valid_project_image(project_image):
        caption = project_media_caption(project)
        media.append(
            source_image(
                project,
                project_image,
                caption,
                caption,
            )
        )
        seen.add(canonical_media_url(project_image))

    source_url = clean_text(project.get("url"), 2_000)
    if urlparse(source_url).hostname != SOURCE_HOST:
        return media[:MAX_MEDIA], "unsupported-source"

    try:
        response = paced_source_get(source_url)
        if response.status_code in {401, 403, 429}:
            return media[:MAX_MEDIA], f"http-{response.status_code}"
        response.raise_for_status()
    except requests.RequestException as error:
        return media[:MAX_MEDIA], type(error).__name__

    soup = BeautifulSoup(response.text, "html.parser")
    content_root = (
        soup.select_one("article .content-for-toc")
        or soup.select_one("article .content")
        or soup.find("article")
    )
    if content_root is None:
        return media[:MAX_MEDIA], "content-root-missing"

    image_candidates = []
    for image in content_root.select(
        ".content-image-wrapper img, figure img, "
        "img[src*='/story_images/'], img[data-src*='/story_images/']"
    ):
        image_url = candidate_image_url(image, response.url)
        parsed = urlparse(image_url)
        host = (parsed.hostname or "").lower()
        path = parsed.path.lower()
        identity = canonical_media_url(image_url)
        image_text = " ".join(
            (
                clean_text(image.get("alt"), 160),
                clean_text(" ".join(image.get("class", [])), 160),
                image_url,
            )
        )
        if (
            not image_url
            or identity in seen
            or parsed.scheme not in {"http", "https"}
            or host != "d1coqmn8qm80r4.cloudfront.net"
            or BAD_IMAGE_TEXT.search(image_text)
            or image_url in BAD_IMAGE_URLS
        ):
            continue
        if (
            "/story_images/" not in path
            and image.find_parent("figure") is None
            and image.find_parent(class_="content-image-wrapper") is None
        ):
            continue
        priority = 0 if "/story_images/" in path else 1
        image_candidates.append((priority, image_url, image))

    for ordinal, (_, image_url, image) in enumerate(
        sorted(image_candidates, key=lambda item: item[0]),
        start=1,
    ):
        identity = canonical_media_url(image_url)
        if identity in seen:
            continue
        seen.add(identity)
        caption = source_image_caption(project, image, ordinal)
        media.append(
            source_image(
                project,
                image_url,
                caption,
                meaningful_alt(image.get("alt")) or caption,
                "source-article-body",
            )
        )
        if len([item for item in media if item["type"] == "image"]) >= MAX_SOURCE_IMAGES:
            break

    video_candidates = []
    for element in content_root.select("iframe[src], iframe[data-src], a[href]"):
        value = (
            element.get("src")
            or element.get("data-src")
            or element.get("href")
            or ""
        )
        embed = normalized_embed(urljoin(response.url, value))
        if embed:
            video_candidates.append((embed, element))

    for embed, element in video_candidates:
        if embed in seen or not video_watch_url(embed):
            continue
        seen.add(embed)
        media.append(video_item(project, element, embed))
        if len(media) >= MAX_MEDIA:
            break
    return media[:MAX_MEDIA], "ok"


def discover_project_media(project: dict) -> tuple[list[dict], str]:
    """Combine original-case media with semantic visuals from the official site."""
    source_media, source_status = discover_source_media(project)
    official_media, official_status = discover_official_media(project)
    source_hero = [
        item for item in source_media if item.get("context") == "project-hero"
    ]
    source_body = [
        item for item in source_media if item.get("context") != "project-hero"
    ]
    combined = merge_media(
        source_hero,
        [*source_body[:2], *official_media, *source_body[2:]],
    )
    status = f"source:{source_status}|official:{official_status}"
    return combined, status


def canonical_media_url(url: str) -> str:
    """Normalize media URLs enough to collapse resized copies of one asset."""
    parsed = urlparse(clean_text(url, 2_000))
    if parsed.hostname in {
        "d1coqmn8qm80r4.cloudfront.net",
        "images.ctfassets.net",
        "res.cloudinary.com",
        "static.wixstatic.com",
    }:
        return f"{parsed.scheme}://{parsed.hostname}{parsed.path}"
    return clean_text(url, 2_000)


def merge_media(
    existing: list[dict],
    discovered: list[dict],
    limit: int = MAX_MEDIA,
) -> list[dict]:
    merged = []
    seen = set()
    for item in [*existing, *discovered]:
        key = canonical_media_url(item.get("url", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(item)
        if len(merged) >= limit:
            break
    return merged


def flow_items(value: str, limit: int = 4) -> list[str]:
    return [
        clean_text(item, 90)
        for item in re.split(r"\s*(?:➔|➡|→|->)\s*", clean_text(value, 800))
        if clean_text(item)
    ][:limit]


def editorial_infographics(project: dict) -> list[dict]:
    name = clean_text(project.get("nameZh") or project.get("name"), 80)
    business_items = flow_items(project.get("businessLoop", ""))
    product_items = flow_items(project.get("productArch", ""))
    launch_items = [
        re.sub(r"^第[一二三四五六七八九十]+步[：:]\s*", "", clean_text(step, 160))
        for step in project.get("getStartedPath", [])
        if clean_text(step)
    ][:4]
    if len(business_items) < 2:
        business_items = [
            "找到高频需求与目标用户",
            clean_text(project.get("businessModel"), 90) or "完成核心产品交付",
            "获得首笔收入并验证复购",
        ]
    if len(product_items) < 2:
        product_items = [
            "明确用户问题",
            clean_text(project.get("summary"), 90) or "交付核心结果",
            "收集反馈并持续迭代",
        ]
    if len(launch_items) < 2:
        launch_items = [
            "访谈目标用户并确认付费问题",
            "用最小版本完成一次真实交付",
            "根据成交、成本与复购数据决定是否扩大",
        ]
    return [
        {
            "type": "infographic",
            "variant": "business-loop",
            "title": f"{name}的商业增长闭环",
            "items": business_items,
            "caption": "AI生意经原创信息图：根据案例商业模式与增长路径整理",
            "origin": "editorial-generated",
            "usage": "site-original",
        },
        {
            "type": "infographic",
            "variant": "product-path",
            "title": f"{name}的产品与交付路径",
            "items": product_items,
            "caption": "AI生意经原创信息图：根据案例产品结构与交付流程整理",
            "origin": "editorial-generated",
            "usage": "site-original",
        },
        {
            "type": "infographic",
            "variant": "china-launch",
            "title": f"{name}的中国市场验证路线",
            "items": launch_items,
            "caption": "AI生意经原创信息图：根据案例资料生成的本土验证步骤",
            "origin": "editorial-generated",
            "usage": "site-original",
        },
    ]


def ensure_visual_media(project: dict, media: list[dict]) -> list[dict]:
    """Guarantee 3-5 distinct visuals without inventing third-party photos."""
    external = []
    seen = set()
    for item in media:
        if item.get("type") == "infographic":
            continue
        key = canonical_media_url(item.get("url", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        external.append(item)
        if len(external) == 5:
            break
    needed = max(0, 3 - len(external))
    return [*external, *editorial_infographics(project)[:needed]]


def clean_existing_media(project: dict, items: list[dict]) -> list[dict]:
    """Remove known page chrome and enrich retained videos with real metadata."""
    cleaned: list[dict] = []
    project_image = canonical_media_url(project.get("image", ""))
    name = clean_text(project.get("nameZh") or project.get("name"), 80)
    source_ordinal = 0
    for item in items:
        media_type = item.get("type")
        media_url = clean_text(item.get("url"), 2_000)
        if media_type == "image":
            text = " ".join(
                (
                    media_url,
                    clean_text(item.get("alt"), 180),
                    clean_text(item.get("caption"), 180),
                )
            )
            parsed = urlparse(media_url)
            is_project_image = (
                canonical_media_url(media_url) == project_image
                and valid_project_image(media_url)
            )
            is_story_image = "/story_images/" in parsed.path.lower()
            is_official = item.get("origin") == "official-site"
            if (
                BAD_IMAGE_TEXT.search(text)
                or media_url in BAD_IMAGE_URLS
                or (not is_project_image and not is_story_image and not is_official)
            ):
                continue
            retained = dict(item)
            retained["context"] = (
                "official-site"
                if is_official
                else (
                    "project-hero"
                    if is_project_image
                    else "source-article-body"
                )
            )
            caption = clean_text(retained.get("caption"), 180)
            if any(marker in caption for marker in GENERIC_CAPTION_MARKERS):
                if is_project_image:
                    caption = project_media_caption(project)
                else:
                    source_ordinal += 1
                    caption = (
                        f"{name}：原始案例中的产品与运营配图"
                        f"（第{source_ordinal}张）"
                    )
                retained["caption"] = caption
                retained["alt"] = caption
            cleaned.append(retained)
        elif media_type == "video":
            embed = normalized_embed(media_url)
            if not embed or not video_watch_url(embed):
                continue
            metadata = public_video_metadata(embed)
            if not metadata["poster"]:
                continue
            retained = dict(item)
            retained["url"] = embed
            retained["watchUrl"] = metadata["watchUrl"]
            retained["poster"] = metadata["poster"]
            retained["provider"] = metadata["provider"]
            if (
                not clean_text(retained.get("caption"), 180)
                or any(
                    marker in clean_text(retained.get("caption"), 180)
                    for marker in GENERIC_CAPTION_MARKERS
                )
            ):
                title = metadata["title"]
                retained["caption"] = (
                    f"{name}资料中提及的视频：{title}"
                    if title
                    else f"{name}相关完整视频"
                )
            retained["alt"] = (
                metadata["title"]
                or clean_text(retained.get("alt"), 180)
                or retained["caption"]
            )
            cleaned.append(retained)
        elif (
            media_type == "video-file"
            and item.get("origin") == "official-site-video"
        ):
            cleaned.append(dict(item))
    return merge_media(cleaned, [], limit=8)


def variant(project_id: str, choices: tuple[str, ...]) -> str:
    digest = hashlib.sha256(project_id.encode("utf-8")).digest()
    return choices[digest[0] % len(choices)]


def build_key_facts(project: dict) -> list[dict]:
    facts = [
        {"label": "营收口径", "value": project.get("revenue") or "未披露"},
        {"label": "项目类型", "value": project.get("niche") or "创业项目"},
        {"label": "启动成本", "value": project.get("startupCost") or "需重新核算"},
        {"label": "首次营收", "value": project.get("timeToRevenue") or "因执行而异"},
        {
            "label": "可复制指数",
            "value": f"{project.get('replicabilityScore') or 7}/10",
        },
        {"label": "落地难度", "value": project.get("difficulty") or "需验证"},
    ]
    return [
        {"label": clean_text(item["label"], 30), "value": clean_text(item["value"], 100)}
        for item in facts
    ]


def project_snapshot(project: dict) -> dict:
    return {
        key: project.get(key)
        for key in (
            "id",
            "name",
            "nameZh",
            "summary",
            "revenue",
            "businessModel",
            "chinaOpportunity",
            "website",
            "updatedAt",
            "scrapedAt",
        )
    }


def build_structured_article(project: dict, media: list[dict]) -> dict:
    project_id = str(project["id"])
    name = clean_text(project.get("nameZh") or project.get("name"), 100)
    summary = clean_text(project.get("summary"), 800)
    insight = clean_text(project.get("insight"), 1_000)
    business_model = clean_text(project.get("businessModel"), 1_000)
    product_arch = clean_text(project.get("productArch"), 1_000)
    business_loop = clean_text(project.get("businessLoop"), 1_000)
    china = clean_text(project.get("chinaOpportunity"), 1_000)
    revenue = clean_text(project.get("revenue") or "未披露", 100)
    niche = clean_text(project.get("niche") or "细分市场", 80)
    startup = clean_text(project.get("startupCost") or "需按实际方案核算", 100)
    time_to_revenue = clean_text(project.get("timeToRevenue") or "取决于验证效率", 100)
    steps = [
        clean_text(step, 700)
        for step in project.get("getStartedPath", [])
        if clean_text(step)
    ][:5]
    while len(steps) < 3:
        steps.append(
            (
                "补充验证：记录目标用户、获客成本、首次成交和复购数据，"
                "只根据真实反馈调整产品。"
            )
        )

    result_line = (
        f"公开资料记录的营收口径是{revenue}"
        if revenue != "未披露"
        else "项目没有公开完整营收数字"
    )
    result_snapshot = (
        f"{revenue}的公开营收口径"
        if revenue != "未披露"
        else "一个尚未公开完整营收的项目"
    )
    opening_lead = variant(
        project_id,
        (
            f"先把结果摆在桌面上：{result_line}。但真正值得研究的，从来不是数字本身。",
            f"如果只看{result_line}，这个案例很容易被读成又一篇创业爽文。可生意真正发生在数字之前。",
            f"{name}最有意思的地方，不只是{result_snapshot}，而是它把一个具体麻烦变成了可收费的交付。",
            f"大多数人会先问“它赚了多少”。关于{name}，更好的问题是：第一位客户为什么愿意掏钱？",
        ),
    )
    opening = (
        f"{opening_lead}\n\n"
        f"{summary.rstrip('。')}。这篇拆解不把{name}包装成标准答案，而是沿着用户问题、产品交付、"
        "收费机制、增长路径和本土验证五条线，重新还原这门生意为什么成立，又可能在哪里失速。"
    )

    sections = [
        {
            "kicker": "01 / 结果",
            "heading": "先看结果：数字很醒目，因果更重要",
            "paragraphs": [
                (
                    f"{name}所在的是{niche}赛道。{summary}"
                    f"从公开数据看，项目营收口径为{revenue}，启动成本约为{startup}，"
                    f"首次营收周期为{time_to_revenue}。这些数字构成了结果快照，却还不是商业解释。"
                ),
                (
                    "要理解结果从哪里来，需要把营收拆回三个动作：用户带着什么问题进入，"
                    "产品在多短时间里给出可感知结果，以及收费是否发生在价值最清晰的节点。"
                    "任何一个环节说不清，漂亮数字都很难变成可迁移的方法。"
                ),
                (
                    "因此，这篇文章不会停留在“做了一个产品、找到一些客户、最终获得收入”的流水账。"
                    "真正要追踪的是因果链：什么承诺带来咨询，什么交付推动付款，"
                    "又是什么机制让一次成交有机会继续变成复购、续费或转介绍。"
                ),
            ],
            "callout": "案例的价值不在于证明别人成功过，而在于找出结果发生前的关键动作。",
        },
        {
            "kicker": "02 / 问题",
            "heading": "用户买的不是功能，而是少走一段弯路",
            "paragraphs": [
                (
                    f"资料对机会的核心判断是：{insight}"
                    "把这句话翻译成用户语言，就是有人正在反复付出时间、金钱或注意力，"
                    "却仍然无法稳定得到想要的结果。生意的入口，往往就藏在这种长期存在的低效率里。"
                ),
                (
                    f"在{niche}市场里，竞争对手未必是另一家公司。它可能是一张表格、一位兼职人员、"
                    "一套拼凑流程，甚至是用户继续忍受问题的惯性。只有当新方案明显更快、更稳、"
                    "更省心或更能带来收入时，改变习惯才会变成真实购买。"
                ),
                (
                    "这也是判断项目是否值得复制的第一道门槛：不要先问市场有多大，"
                    "先找到问题发生最频繁、损失最容易计算的一小群人。"
                    "他们愿不愿意停下现有工作、尝试新流程并付费，比任何泛泛的“感兴趣”都更可信。"
                ),
            ],
            "callout": "真正的需求，不只会得到一句“不错”，还会让用户愿意改变原来的做法。",
        },
        {
            "kicker": "03 / 产品",
            "heading": "产品怎么工作：把一次交付拆成看得见的路径",
            "paragraphs": [
                (
                    f"资料把{name}的产品路径概括为：{product_arch}。"
                    "这不是一张普通功能清单，而是一条从“用户带着问题进入”到“用户拿到结果离开”的交付链。"
                    "链条越清楚，团队越容易识别真正创造价值的节点。"
                ),
                (
                    "对小团队而言，入口要足够简单，首次体验要尽快出现一个“小胜利”，"
                    "核心交付必须能够被重复，异常情况还要有明确处理方式。"
                    "如果每个客户都需要创始人重新解释、临时补救，项目仍然更像手工作坊，而不是产品。"
                ),
                (
                    "第一版并不需要覆盖所有场景。更合理的目标，是完整解决一个高频任务："
                    "让用户知道从哪里开始、过程中发生什么、最终会得到什么。"
                    "当这条最短路径稳定后，再增加自动化、协作、数据分析或高级服务，产品才不会越做越重。"
                ),
            ],
            "callout": "产品成熟度不看功能有多少，而看承诺的结果能否稳定、重复地出现。",
        },
        {
            "kicker": "04 / 收入",
            "heading": "钱从哪里来：定价只是表面，履约才是底层",
            "paragraphs": [
                (
                    f"{name}的商业模式被描述为：{business_model}"
                    "收费方式本身并没有高下之分；真正的问题是，用户在什么时候最清楚地感受到价值，"
                    "以及每收到一笔钱，团队还需要承担多少获客、交付和售后成本。"
                ),
                (
                    "一次性销售回款快，但需要持续寻找新客户；订阅收入更可预测，"
                    "却要求产品不断提供持续价值；服务型收入能深入客户场景，"
                    "同时也更容易被人力和交付复杂度限制。项目选择的不是一个价格标签，而是一组经营责任。"
                ),
                (
                    f"公开资料中的启动成本约为{startup}，首次营收周期为{time_to_revenue}。"
                    "更专业的用法，是把它们当作验证假设而不是承诺：先确认第一笔钱为什么发生，"
                    "再追踪毛利、退款、回款周期和复购。营收证明有人买，现金流才证明这门生意能继续。"
                ),
            ],
            "callout": "定价决定用户怎么付款，履约结构决定团队能不能长期赚钱。",
        },
        {
            "kicker": "05 / 增长",
            "heading": "增长飞轮：让承诺、成交和留存说同一种语言",
            "paragraphs": [
                f"现有资料把增长闭环总结为：{business_loop}。",
                (
                    "闭环最容易断在“前后不一致”：内容讲的是一个痛点，落地页却堆满功能；"
                    "销售承诺快速见效，产品首次体验却迟迟不给结果；首单靠低价成交，"
                    "后续又没有持续价值支撑续费。流量越大，这种错位只会被放大得越快。"
                ),
                (
                    "早期最有效的增长动作，通常不是铺开所有渠道，而是找到目标用户密度最高的一个入口。"
                    "连续记录曝光、有效咨询、关键体验、付费和复购五组数据，"
                    "就能看出问题究竟出在流量质量、价值表达、产品体验还是交付结果。"
                ),
                (
                    "当某一环节持续掉队时，先修复闭环，不要用更多流量掩盖问题。"
                    "真正健康的增长，是正确用户被同一个承诺吸引，在产品里得到对应结果，"
                    "最后愿意继续使用或主动推荐。增长因此不是一个营销部门的任务，而是整条价值链的结果。"
                ),
            ],
            "callout": "增长不是把更多人带进来，而是让正确的人沿着价值路径继续走下去。",
        },
        {
            "kicker": "06 / 护城河",
            "heading": "最难复制的部分，往往不在网页上",
            "paragraphs": [
                (
                    f"资料给{name}的可复制指数是{project.get('replicabilityScore') or 7}/10，"
                    f"落地难度标注为{project.get('difficulty') or '需验证'}。"
                    "这类评分适合快速筛选，却不能代替执行判断。真正的门槛可能藏在供应链、专业能力、"
                    "渠道关系、合规要求、历史数据或售后经验里。"
                ),
                (
                    "样板客户阶段跑得顺，不代表规模化后仍然成立。订单增加会放大交付波动、"
                    "客服压力和现金占用；新渠道会带来不同的人群和预期。"
                    "流程文档、质量标准、异常处理和经营数据并非大公司专属，而是小团队扩大前的安全带。"
                ),
                (
                    "最值得学习的不是把页面和功能照着做一遍，而是建立同样的反馈速度。"
                    "每完成一轮交付就记录：哪一步最耗时，什么承诺最能推动成交，"
                    "哪些客户最容易成功，哪些问题总在重复出现。把答案持续固化进产品，才会形成别人难以复制的能力。"
                ),
            ],
            "callout": "页面可以模仿，持续交付结果的组织能力很难速成。",
        },
        {
            "kicker": "07 / 中国机会",
            "heading": "搬到中国市场：不要只翻译页面，要重做验证",
            "paragraphs": [
                china,
                (
                    "海外案例只能证明某类需求曾经在一个市场成立，不能替代国内的一手判断。"
                    "微信生态、短视频平台、支付习惯、价格敏感度、行业监管和售后预期，"
                    "都会改变获客方式、产品边界与单位经济模型。直接翻译和换皮，通常复制不了原项目的因果链。"
                ),
                (
                    "更现实的切口，是先限定一个行业、城市或人群，用十到二十次深度访谈还原现有流程，"
                    "再拿出一个能够收费的最小交付。用户如果只说喜欢，却不愿改变原来的做法，"
                    "说明问题还不够痛、价值不够清楚，或者目标人群仍然太宽。"
                ),
            ],
            "callout": "本土化不是复制海外答案，而是重新找到国内用户愿意付钱的那一刻。",
        },
        {
            "kicker": "08 / 行动",
            "heading": "如果今天从零开始：先跑一轮七天验证",
            "paragraphs": [
                steps[0],
                steps[1],
                steps[2],
                (
                    "每一步都要提前写下通过门槛：有效访谈多少人、愿意付费多少人、"
                    "一次交付需要多久、用户是否愿意再次使用。达到门槛才扩大；没有达到，"
                    "先调整人群、承诺或交付方式，不要立刻用更多功能来安慰自己。"
                ),
            ],
            "callout": "第一版不是为了显得完整，而是为了尽快拿到无法伪装的真实反馈。",
        },
    ]

    total_chars = sum(
        len(paragraph)
        for section in sections
        for paragraph in section["paragraphs"]
    )
    visual_media = ensure_visual_media(project, media)
    return {
        "projectId": project_id,
        "project": project_snapshot(project),
        "slug": project.get("slug") or project_id,
        "title": (
            f"{name}：{revenue}营收背后，一门生意是怎样跑通的"
            if revenue != "未披露"
            else f"{name}：一个细分需求如何长成可持续生意"
        ),
        "dek": (
            f"不讲空泛成功学，从用户为什么付钱开始，拆开{name}的产品、"
            "收入、增长与本土化机会，看清结果背后的商业因果。"
        ),
        "opening": opening,
        "editorNote": "案例不是答案，而是一组等待被验证的经营假设。",
        "highlights": [
            "用户为什么愿意改变原来的做法",
            "产品如何把价值变成稳定交付",
            "收入、增长和留存怎样接成闭环",
            "放到中国市场应先验证什么",
        ],
        "keyFacts": build_key_facts(project),
        "sections": sections,
        "conclusion": (
            f"{name}真正值得借鉴的，不是页面长什么样，也不是把{revenue}当成新的目标。"
            "更重要的是它提供了一条观察路径：先找到正在付出代价的人，再把结果组织成产品，"
            "让收费发生在价值最清楚的节点，最后用连续数据判断这条路是否值得扩大。"
            "案例读完之后，最有价值的动作不是收藏，而是挑出其中一个假设，"
            "写下目标用户、使用场景、价格、交付方式和七天后的通过门槛。"
            "真实反馈可能支持判断，也可能迅速推翻它；两种结果都比继续停留在想象中更接近一门生意。"
        ),
        "riskNote": (
            "营收、团队、增长及渠道信息来自项目数据库与公开来源在特定时间点的披露，"
            "可能已经变化；涉及健康、金融、教育、数据和跨境业务时，应按经营所在地最新规则独立核验。"
        ),
        "media": visual_media,
        "source": {
            "name": "Starter Story",
            "url": project.get("url", ""),
            "notice": "本文依据公开事实与本站结构化资料重新编辑，不是原文翻译。",
        },
        "website": project.get("website", ""),
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "provider": "structured-editorial",
        "status": "full",
        "quality": {
            "sectionCount": len(sections),
            "bodyCharacters": total_chars,
            "mediaCount": len(visual_media),
            "readingMinutes": max(5, round(total_chars / 420)),
        },
    }


def generate_one(
    project: dict,
    reviewed: dict[str, dict],
    existing: dict[str, dict],
    fetch_media: bool,
    overwrite_reviewed: bool,
) -> tuple[str, dict, dict]:
    project_id = str(project["id"])
    if project_id in reviewed and not overwrite_reviewed:
        article = reviewed[project_id]
        return project_id, article, {
            "projectId": project_id,
            "preserved": True,
            "mediaStatus": "reviewed",
            "mediaCount": len(article.get("media", [])),
        }

    if fetch_media:
        media, media_status = discover_project_media(project)
    elif existing.get(project_id, {}).get("media"):
        media = existing[project_id]["media"]
        media_status = "existing-media"
    else:
        image = clean_text(project.get("image"), 2_000)
        media = (
            [
                source_image(
                    project,
                    image,
                    f"{clean_text(project.get('nameZh'), 80)}公开案例主图",
                    f"{clean_text(project.get('nameZh'), 80)}案例图片",
                )
            ]
            if image
            else []
        )
        media_status = "project-image-only"
    article = build_structured_article(project, media)
    if existing.get(project_id, {}).get("mediaDiscovery"):
        article["mediaDiscovery"] = existing[project_id]["mediaDiscovery"]
    return project_id, article, {
        "projectId": project_id,
        "preserved": False,
        "mediaStatus": media_status,
        "mediaCount": len(media),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fetch-media",
        action="store_true",
        help="Discover additional public source images and embeddable videos",
    )
    parser.add_argument("--workers", type=int, default=10)
    parser.add_argument(
        "--overwrite-reviewed",
        action="store_true",
        help="Replace the manually reviewed pilot articles too",
    )
    parser.add_argument(
        "--retry-without-media",
        action="store_true",
        help="Only retry source discovery for existing articles without media",
    )
    parser.add_argument(
        "--enrich-under-media",
        type=int,
        default=0,
        metavar="COUNT",
        help="Retry source discovery for articles with fewer than COUNT media",
    )
    parser.add_argument(
        "--missing-only",
        action="store_true",
        help="Generate only project IDs that do not yet have an article file",
    )
    parser.add_argument(
        "--refresh-all-media",
        action="store_true",
        help=(
            "Replace polluted media on existing articles using only source "
            "story content; article prose is preserved"
        ),
    )
    parser.add_argument(
        "--refresh-media-ids",
        nargs="+",
        default=[],
        metavar="PROJECT_ID",
        help=(
            "Replace media for selected projects using Starter Story and "
            "official-site discovery, then fill only genuine gaps"
        ),
    )
    parser.add_argument(
        "--enrich-official-batch",
        type=int,
        default=0,
        metavar="COUNT",
        help=(
            "Progressively replace infographic gaps with official product "
            "media for up to COUNT eligible articles"
        ),
    )
    parser.add_argument(
        "--normalize-local-media",
        action="store_true",
        help=(
            "Add explicit source context to refreshed images and remove "
            "videos whose public poster is unavailable"
        ),
    )
    parser.add_argument(
        "--ensure-visual-media",
        action="store_true",
        help=(
            "Keep real media first and fill any gap below three items with "
            "clearly labelled original editorial infographics"
        ),
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=0.5,
        help="Delay before each missing-media retry request",
    )
    parser.add_argument(
        "--request-interval",
        type=float,
        default=0.0,
        help="Minimum process-wide interval between source requests",
    )
    parser.add_argument(
        "--request-retries",
        type=int,
        default=0,
        help="Number of bounded retries after a source returns HTTP 429",
    )
    args = parser.parse_args()
    configure_source_requests(args.request_interval, args.request_retries)

    projects = load_json(PROJECTS_FILE, [])
    legacy = load_json(LEGACY_ARTICLES_FILE, [])
    reviewed = {
        str(article["projectId"]): article
        for article in legacy
        if article.get("projectId")
    }
    ARTICLES_DIR.mkdir(parents=True, exist_ok=True)
    existing = {
        path.stem: load_json(path, {})
        for path in ARTICLES_DIR.glob("*.json")
    }

    if args.refresh_media_ids:
        projects_by_id = {str(project["id"]): project for project in projects}
        target_ids = [
            project_id
            for project_id in args.refresh_media_ids
            if project_id in projects_by_id and project_id in existing
        ]

        def refresh_selected(project_id: str):
            media, media_status = discover_project_media(
                projects_by_id[project_id]
            )
            return project_id, media, media_status

        records = []
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=max(1, args.workers)
        ) as executor:
            futures = [
                executor.submit(refresh_selected, project_id)
                for project_id in target_ids
            ]
            for index, future in enumerate(
                concurrent.futures.as_completed(futures),
                start=1,
            ):
                project_id, discovered, media_status = future.result()
                article = existing[project_id]
                before = article.get("media", [])
                final_media = ensure_visual_media(
                    projects_by_id[project_id],
                    discovered,
                )
                article["media"] = final_media
                article.setdefault("quality", {})["mediaCount"] = len(final_media)
                article["mediaDiscovery"] = {
                    "officialStatus": media_status.split("|official:")[-1],
                    "attemptedAt": datetime.datetime.now(
                        datetime.timezone.utc
                    ).isoformat(),
                }
                save_json(ARTICLES_DIR / f"{project_id}.json", article)
                records.append(
                    {
                        "projectId": project_id,
                        "mediaStatus": media_status,
                        "beforeCount": len(before),
                        "mediaCount": len(final_media),
                        "realMedia": sum(
                            item.get("type") != "infographic"
                            for item in final_media
                        ),
                    }
                )
                print(f"[SELECTED MEDIA] {index}/{len(futures)} {project_id}")
        print(json.dumps({"refreshed": records}, ensure_ascii=False, indent=2))
        return

    if args.enrich_official_batch:
        projects_by_id = {str(project["id"]): project for project in projects}
        now = datetime.datetime.now(datetime.timezone.utc)

        def retry_due(article: dict) -> bool:
            discovery = article.get("mediaDiscovery", {})
            attempted = clean_text(discovery.get("attemptedAt"), 80)
            status = clean_text(discovery.get("officialStatus"), 80)
            if not attempted:
                return True
            try:
                attempted_at = datetime.datetime.fromisoformat(
                    attempted.replace("Z", "+00:00")
                )
                if attempted_at.tzinfo is None:
                    attempted_at = attempted_at.replace(
                        tzinfo=datetime.timezone.utc
                    )
            except ValueError:
                return True
            retry_days = 30 if status == "no-semantic-media" else 7
            return (now - attempted_at).days >= retry_days

        target_ids = []
        for project in projects:
            project_id = str(project["id"])
            article = existing.get(project_id, {})
            if (
                project.get("website")
                and any(
                    item.get("type") == "infographic"
                    for item in article.get("media", [])
                )
                and retry_due(article)
            ):
                target_ids.append(project_id)
                if len(target_ids) >= max(1, args.enrich_official_batch):
                    break

        def enrich_official(project_id: str):
            media, status = discover_official_media(projects_by_id[project_id])
            return project_id, media, status

        records = []
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=max(1, args.workers)
        ) as executor:
            futures = [
                executor.submit(enrich_official, project_id)
                for project_id in target_ids
            ]
            for index, future in enumerate(
                concurrent.futures.as_completed(futures),
                start=1,
            ):
                project_id, discovered, status = future.result()
                article = existing[project_id]
                before = article.get("media", [])
                real_existing = [
                    item for item in before if item.get("type") != "infographic"
                ]
                final_media = ensure_visual_media(
                    projects_by_id[project_id],
                    merge_media(real_existing, discovered),
                )
                article["media"] = final_media
                article.setdefault("quality", {})["mediaCount"] = len(final_media)
                article["mediaDiscovery"] = {
                    "officialStatus": status,
                    "attemptedAt": now.isoformat(),
                }
                save_json(ARTICLES_DIR / f"{project_id}.json", article)
                records.append(
                    {
                        "projectId": project_id,
                        "status": status,
                        "beforeReal": sum(
                            item.get("type") != "infographic" for item in before
                        ),
                        "afterReal": sum(
                            item.get("type") != "infographic"
                            for item in final_media
                        ),
                    }
                )
                print(f"[OFFICIAL MEDIA] {index}/{len(futures)} {project_id}")
        print(json.dumps({"enriched": records}, ensure_ascii=False, indent=2))
        return

    if args.ensure_visual_media:
        projects_by_id = {str(project["id"]): project for project in projects}
        updated = 0
        infographic_count = 0
        for project_id, article in existing.items():
            project = projects_by_id.get(project_id)
            if not project:
                continue
            final_media = ensure_visual_media(
                project,
                article.get("media", []),
            )
            infographic_count += sum(
                item.get("type") == "infographic" for item in final_media
            )
            if final_media != article.get("media", []):
                article["media"] = final_media
                article.setdefault("quality", {})["mediaCount"] = len(final_media)
                save_json(ARTICLES_DIR / f"{project_id}.json", article)
                updated += 1

        updated_reviewed = [
            existing[project_id]
            for project_id in reviewed
            if project_id in existing
        ]
        if updated_reviewed:
            order = {
                str(item.get("projectId")): index
                for index, item in enumerate(legacy)
            }
            updated_reviewed.sort(
                key=lambda item: order.get(
                    str(item.get("projectId")),
                    len(order),
                )
            )
            save_json(LEGACY_ARTICLES_FILE, updated_reviewed)
        print(
            json.dumps(
                {
                    "updatedArticles": updated,
                    "editorialInfographics": infographic_count,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    if args.normalize_local_media:
        projects_by_id = {str(project["id"]): project for project in projects}
        removed_videos = 0
        updated = 0
        for project_id, article in existing.items():
            project = projects_by_id.get(project_id)
            if not project:
                continue
            project_image = canonical_media_url(project.get("image", ""))
            normalized = []
            for item in article.get("media", []):
                retained = dict(item)
                if retained.get("type") == "image":
                    if retained.get("origin") == "source-attributed":
                        retained["context"] = (
                            "project-hero"
                            if canonical_media_url(retained.get("url", ""))
                            == project_image
                            else "source-article-body"
                        )
                    elif retained.get("origin") == "official-site":
                        retained["context"] = "official-site"
                if (
                    retained.get("type") == "video"
                    and not retained.get("poster")
                ):
                    removed_videos += 1
                    continue
                normalized.append(retained)
            if normalized != article.get("media", []):
                article["media"] = normalized
                article.setdefault("quality", {})["mediaCount"] = len(normalized)
                save_json(ARTICLES_DIR / f"{project_id}.json", article)
                updated += 1

        updated_reviewed = [
            existing[project_id]
            for project_id in reviewed
            if project_id in existing
        ]
        if updated_reviewed:
            order = {
                str(item.get("projectId")): index
                for index, item in enumerate(legacy)
            }
            updated_reviewed.sort(
                key=lambda item: order.get(
                    str(item.get("projectId")),
                    len(order),
                )
            )
            save_json(LEGACY_ARTICLES_FILE, updated_reviewed)
        print(
            json.dumps(
                {
                    "updatedArticles": updated,
                    "removedVideosWithoutPoster": removed_videos,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    if args.refresh_all_media:
        projects_by_id = {str(project["id"]): project for project in projects}
        reviewed_ids = set(reviewed)
        target_ids = [
            project_id
            for project_id in existing
            if project_id in projects_by_id and project_id not in reviewed_ids
        ]

        def refresh(project_id: str):
            project = projects_by_id[project_id]
            discovered, media_status = discover_project_media(project)
            return project_id, discovered, media_status

        refreshed_results: dict[str, tuple[list[dict], str]] = {}
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=max(1, args.workers)
        ) as executor:
            futures = [executor.submit(refresh, item) for item in target_ids]
            for index, future in enumerate(
                concurrent.futures.as_completed(futures),
                start=1,
            ):
                project_id, discovered, media_status = future.result()
                refreshed_results[project_id] = (discovered, media_status)
                if index % 100 == 0 or index == len(futures):
                    print(f"[MEDIA REFRESH] {index}/{len(futures)}")

        records = []
        updated_reviewed = []
        for project_id, article in existing.items():
            project = projects_by_id.get(project_id)
            if not project:
                continue
            before = article.get("media", [])
            cleaned = clean_existing_media(project, before)
            if project_id in reviewed_ids:
                final_media = cleaned
                media_status = "reviewed-preserved"
            else:
                discovered, media_status = refreshed_results.get(
                    project_id,
                    ([], "refresh-missing"),
                )
                official = [
                    item
                    for item in cleaned
                    if item.get("origin") in {
                        "official-site",
                        "official-site-video",
                    }
                ]
                if media_status == "ok":
                    final_media = merge_media(discovered, official)
                else:
                    final_media = merge_media(cleaned, discovered)
            article["media"] = final_media
            article.setdefault("quality", {})["mediaCount"] = len(final_media)
            save_json(ARTICLES_DIR / f"{project_id}.json", article)
            if project_id in reviewed_ids:
                updated_reviewed.append(article)
            records.append(
                {
                    "projectId": project_id,
                    "mediaStatus": media_status,
                    "beforeCount": len(before),
                    "mediaCount": len(final_media),
                }
            )

        if updated_reviewed:
            reviewed_order = {
                str(item.get("projectId")): index
                for index, item in enumerate(legacy)
            }
            updated_reviewed.sort(
                key=lambda item: reviewed_order.get(
                    str(item.get("projectId")),
                    len(reviewed_order),
                )
            )
            save_json(LEGACY_ARTICLES_FILE, updated_reviewed)

        report = {
            "refreshed": len(records),
            "beforeMedia": sum(record["beforeCount"] for record in records),
            "afterMedia": sum(record["mediaCount"] for record in records),
            "removed": sum(
                max(0, record["beforeCount"] - record["mediaCount"])
                for record in records
            ),
            "withMedia": sum(record["mediaCount"] > 0 for record in records),
            "withoutMedia": sum(record["mediaCount"] == 0 for record in records),
            "statuses": dict(
                Counter(record["mediaStatus"] for record in records)
            ),
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    if args.retry_without_media or args.enrich_under_media:
        projects_by_id = {str(project["id"]): project for project in projects}
        threshold = max(1, args.enrich_under_media or 1)
        target_ids = [
            project_id
            for project_id, article in existing.items()
            if len(article.get("media", [])) < threshold
            and project_id in projects_by_id
        ]

        def retry(project_id: str):
            time.sleep(max(0.0, args.retry_delay))
            media, media_status = discover_project_media(
                projects_by_id[project_id]
            )
            return project_id, media, media_status

        records = []
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=max(1, args.workers)
        ) as executor:
            futures = [executor.submit(retry, item) for item in target_ids]
            for index, future in enumerate(
                concurrent.futures.as_completed(futures),
                start=1,
            ):
                project_id, media, media_status = future.result()
                article = existing[project_id]
                before_count = len(article.get("media", []))
                merged = merge_media(article.get("media", []), media)
                if len(merged) > before_count:
                    article["media"] = merged
                    article.setdefault("quality", {})["mediaCount"] = len(merged)
                    save_json(ARTICLES_DIR / f"{project_id}.json", article)
                records.append(
                    {
                        "projectId": project_id,
                        "mediaStatus": media_status,
                        "beforeCount": before_count,
                        "mediaCount": len(merged),
                    }
                )
                if index % 10 == 0 or index == len(futures):
                    print(f"[MEDIA RETRY] {index}/{len(futures)}")
        print(
            json.dumps(
                {
                    "retried": len(records),
                    "enriched": sum(
                        record["mediaCount"] > record["beforeCount"]
                        for record in records
                    ),
                    "reachedTarget": sum(
                        record["mediaCount"] >= threshold for record in records
                    ),
                    "remainingBelowTarget": sum(
                        record["mediaCount"] < threshold for record in records
                    ),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    selected_projects = (
        [
            project
            for project in projects
            if str(project["id"]) not in existing
        ]
        if args.missing_only
        else projects
    )
    results: dict[str, dict] = dict(existing) if args.missing_only else {}
    records: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=max(1, args.workers)
    ) as executor:
        futures = [
            executor.submit(
                generate_one,
                project,
                reviewed,
                existing,
                args.fetch_media,
                args.overwrite_reviewed,
            )
            for project in selected_projects
        ]
        for index, future in enumerate(
            concurrent.futures.as_completed(futures),
            start=1,
        ):
            project_id, article, record = future.result()
            results[project_id] = article
            records.append(record)
            if index % 100 == 0 or index == len(futures):
                print(f"[CATALOG] {index}/{len(futures)}")

    expected_ids = {str(project["id"]) for project in projects}
    for stale_file in ARTICLES_DIR.glob("*.json"):
        if stale_file.stem not in expected_ids:
            stale_file.unlink()
    for project in projects:
        project_id = str(project["id"])
        results[project_id]["project"] = project_snapshot(project)
        save_json(ARTICLES_DIR / f"{project_id}.json", results[project_id])

    report = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "projectCount": len(projects),
        "articleCount": len(results),
        "processedThisRun": len(records),
        "reviewedPreserved": sum(
            article.get("status") == "pilot" for article in results.values()
        ),
        "withMedia": sum(
            bool(article.get("media")) for article in results.values()
        ),
        "withoutMedia": sum(
            not article.get("media") for article in results.values()
        ),
        "mediaItems": sum(
            len(article.get("media", [])) for article in results.values()
        ),
        "mediaStatus": dict(
            sorted(
                {
                    status: sum(
                        record["mediaStatus"] == status for record in records
                    )
                    for status in {record["mediaStatus"] for record in records}
                }.items()
            )
        ),
        "withoutMediaIds": [
            project_id
            for project_id, article in results.items()
            if not article.get("media")
        ],
    }
    save_json(REPORT_FILE, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
