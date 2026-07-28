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


def canonical_media_url(url: str) -> str:
    """Normalize media URLs enough to collapse resized copies of one asset."""
    parsed = urlparse(clean_text(url, 2_000))
    if parsed.hostname == "d1coqmn8qm80r4.cloudfront.net":
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

    opening_lead = variant(
        project_id,
        (
            "许多生意并不是从宏大愿景开始，而是从一段反复发生、又一直没有被妥善解决的麻烦开始。",
            "当一个用户愿意反复寻找替代方案时，问题往往已经不只是抱怨，而可能是一笔真实预算。",
            "创业案例最有价值的部分，通常不在最终营收，而在第一批用户为什么愿意付钱。",
            "把一个海外项目放到显微镜下，首先要看的不是页面多漂亮，而是它替谁完成了什么任务。",
        ),
    )
    opening = (
        f"{opening_lead}{name}提供了一个具体样本：{summary}"
        f"项目资料记录的营收口径为{revenue}，但比数字更值得拆解的，"
        "是需求如何被整理成产品、产品如何进入用户场景，以及收入如何沿着一条可重复的路径发生。"
    )

    sections = [
        {
            "heading": "先别看规模：这门生意抓住了什么具体问题",
            "paragraphs": [
                summary,
                (
                    f"现有资料对机会的判断是：{insight}"
                    "这句话需要拆成三个问题理解——谁最频繁遇到这个问题、"
                    "他们现在用什么笨办法解决，以及改进后的结果是否足以支撑付费。"
                ),
                (
                    f"从{niche}赛道看，真正的竞争对象不一定是同类品牌，"
                    "也可能是表格、人工服务、线下渠道或用户“继续忍受”的惯性。"
                    "只有把替代方案和决策成本看清，市场规模才不只是一个抽象数字。"
                ),
            ],
            "callout": "先证明问题高频、结果可感知，再讨论产品可以做多大。",
        },
        {
            "heading": "产品不是功能清单，而是一条结果交付链",
            "paragraphs": [
                (
                    f"项目的产品路径被概括为：{product_arch}。"
                    "这条链路的价值，在于把用户从提出需求到获得结果的过程拆成若干可观察节点。"
                ),
                (
                    "对小团队来说，每个节点都对应一个经营问题：入口是否足够简单，"
                    "核心交付能否稳定复现，用户是否能快速感知价值，售后是否会吞掉利润。"
                    "第一版产品不必覆盖所有场景，但必须把最关键的一次交付做完整。"
                ),
                (
                    "如果用户还需要大量解释、手工补救或创始人亲自盯住才能完成任务，"
                    "说明系统尚未真正产品化。反过来，能够被标准化的步骤越多，"
                    "团队才越有机会在不同比例增加人力的情况下扩大收入。"
                ),
            ],
            "callout": "判断产品成熟度，不看功能数量，而看结果能否稳定、重复地交付。",
        },
        {
            "heading": "收入从哪里来：收费方式必须对应价值发生的时刻",
            "paragraphs": [
                (
                    f"项目资料给出的商业模式是：{business_model}"
                    f"当前记录的营收口径为{revenue}。这些数字只能作为特定时间点的公开披露，"
                    "不能直接等同于今天的收入或利润。"
                ),
                (
                    "拆商业模式时，应分别看客单价、毛利、交付成本、退款与复购。"
                    "一次性销售可以更快回款，订阅能够提高收入可预测性，服务型收入则可能带来更深的客户关系；"
                    "但每一种收费方式，都伴随不同的获客压力和履约责任。"
                ),
                (
                    f"资料估计的启动成本是{startup}，首次营收周期为{time_to_revenue}。"
                    "这两个指标更适合被当作验证假设：先用最小投入确认有人付钱，"
                    "再把资金投入到真正改善成交率、交付效率或留存的环节。"
                ),
            ],
            "callout": "营收说明有人付钱，利润和现金流才说明这套交付能够持续。",
        },
        {
            "heading": "增长闭环：流量、成交与留存如何接成同一条线",
            "paragraphs": [
                f"现有资料将增长闭环总结为：{business_loop}。",
                (
                    "这里最容易被忽略的是前后承诺必须一致。用户因为一个具体问题被内容或渠道吸引，"
                    "落地页就应该继续解释同一个问题，首次体验要尽快给出与承诺相关的结果，"
                    "后续服务再围绕复购、转介绍或使用频率建立留存。"
                ),
                (
                    "早期不要同时铺开所有渠道。更有效的方法，是只选择一个目标用户密度最高的入口，"
                    "持续记录曝光、咨询、试用、付费和复购五组数据。"
                    "当某一环节持续掉队时，优先修复闭环，而不是用更多流量掩盖问题。"
                ),
            ],
            "callout": "增长不是把人带进来，而是让正确的人沿着价值路径继续走下去。",
        },
        {
            "heading": "运营真正困难的地方：把一次成功变成日常能力",
            "paragraphs": [
                (
                    f"该项目的可复制指数为{project.get('replicabilityScore') or 7}/10，"
                    f"资料标注的落地难度为{project.get('difficulty') or '需验证'}。"
                    "评分只能用于快速筛选，真正决定执行难度的，是供应链、专业能力、渠道资源、"
                    "合规要求和售后复杂度。"
                ),
                (
                    "一门生意在样板客户阶段表现良好，不代表规模化后仍然成立。"
                    "订单增加会放大交付波动、客服压力和现金占用；渠道扩张会带来不同的人群和预期。"
                    "因此，流程文档、质量标准、异常处理和数据看板并不是大公司专属，而是小团队扩大前的基础设施。"
                ),
                (
                    "更稳妥的节奏，是每完成一轮交付就复盘：哪些步骤最耗时，哪些问题重复出现，"
                    "哪些承诺最能推动成交，哪些客户最可能续费。"
                    "把这些答案固化进产品和流程，增长才不会完全依赖创始人的个人能力。"
                ),
            ],
            "callout": "规模化的本质，是让正确动作可以被团队重复，而不是让创始人更忙。",
        },
        {
            "heading": "不要被营收数字带偏：建立一张可验证的经营仪表盘",
            "paragraphs": [
                (
                    f"{revenue}是这个项目最醒目的公开营收口径，但它只回答了“卖了多少”，"
                    "没有回答收入发生在多长周期、来自多少客户、扣除履约与获客后还剩多少。"
                    "复盘类似项目时，至少应把流量、线索、付费、交付、复购和现金回收拆开记录。"
                ),
                (
                    "获客阶段关注有效咨询率，而不是只有曝光；成交阶段同时记录客单价和决策周期；"
                    "交付阶段统计毛利、工时、退款和异常率；留存阶段再看复购、续费与转介绍。"
                    "这些指标放在同一张表中，才能判断增长究竟来自产品变好、渠道变准，还是短期投入变多。"
                ),
                (
                    f"对于{name}这类{niche}项目，最早的一组数据不需要复杂系统。"
                    "一张按周更新的实验表就足够：本周改了什么、接触了多少目标用户、"
                    "有多少人完成关键动作、收入和交付成本分别是多少，以及下一轮只准备验证哪一个变量。"
                ),
                (
                    "当团队连续数周使用同一口径记录数据，许多争论会自然消失。"
                    "如果咨询很多却无人付费，应检查人群与承诺；如果成交不错但交付失控，应先标准化流程；"
                    "如果首单顺利却没有复购，则要重新判断产品是一次性需求，还是持续价值没有被表达出来。"
                ),
            ],
            "callout": "案例给出的是假设，统一口径、连续记录的数据才会给出经营答案。",
        },
        {
            "heading": "放到中国市场，不能只做翻译和换皮",
            "paragraphs": [
                china,
                (
                    "海外案例证明的是某类需求可能存在，并不能替代国内的一手验证。"
                    "微信生态、内容平台、支付习惯、价格敏感度、行业监管和售后预期，"
                    "都可能改变原有产品的获客方式和单位经济模型。"
                ),
                (
                    "更现实的切入方式，是先限定一个城市、行业或人群，"
                    "用十到二十次深度访谈确认用户当前方案，再用可收费的最小交付验证购买意愿。"
                    "如果目标用户只表示喜欢，却不愿改变现有流程或付费，说明定位仍需继续收窄。"
                ),
            ],
            "callout": "本土化不是复制答案，而是用同样严谨的方法重新验证问题。",
        },
        {
            "heading": "三步启动：用最小成本跑出第一轮真实反馈",
            "paragraphs": [
                steps[0],
                steps[1],
                steps[2],
                (
                    "执行时建议为每一步设置可量化门槛，例如有效访谈数量、"
                    "首批付费人数、交付耗时和复购意向。只有数据达到预设标准才扩大投入；"
                    "没有达到时，先调整人群、承诺或交付方式，而不是立即增加功能。"
                ),
            ],
            "callout": "第一版的任务不是显得完整，而是尽快获得无法伪装的付费反馈。",
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
        "title": f"{name}：从真实需求到可重复收入的商业拆解",
        "dek": (
            f"围绕产品、收费、增长闭环与中国市场验证，拆解{name}"
            "如何把一个具体问题组织成可持续经营的生意。"
        ),
        "opening": opening,
        "keyFacts": build_key_facts(project),
        "sections": sections,
        "conclusion": (
            f"{name}真正值得借鉴的，不是照搬页面、产品或营收数字，"
            "而是从具体用户问题出发，依次验证交付、收费、获客与留存。"
            "对准备进入相似方向的创业者来说，最重要的下一步不是继续收集案例，"
            "而是把其中一个判断变成可执行实验，用真实付费和持续使用来决定是否扩大。"
            "先写下准备验证的用户、场景、价格和成功门槛，再给实验设置明确截止日期；"
            "无论结果支持还是推翻原判断，都会比继续停留在概念层面更接近一门真实生意。"
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
        media, media_status = discover_source_media(project)
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
            discovered, media_status = discover_source_media(project)
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
            media, media_status = discover_source_media(
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
