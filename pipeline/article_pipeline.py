#!/usr/bin/env python3
"""Generate original on-site case articles from public factual source notes.

Cloudflare Workers AI is attempted first through the private editorial endpoint.
DeepSeek is used only when that endpoint is unavailable or its quota is exhausted.
The pipeline never bypasses authentication/paywalls and does not republish source
article prose or Starter Story-hosted media.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parent.parent
PROJECTS_FILE = ROOT / "data" / "projects_live.json"
ARTICLES_FILE = ROOT / "data" / "case_articles.json"
SOURCE_HOST = "www.starterstory.com"
BLOCKED_MEDIA_HOSTS = {
    "starterstory.com",
    "www.starterstory.com",
    "cloudfront.net",
}
DEFAULT_EDITORIAL_ENDPOINT = "https://ai-shengyi-jing.pages.dev/api/editorial"
REQUEST_DELAY = 2
MAX_SOURCE_NOTES = 12_000

HEADERS = {
    "User-Agent": (
        "AIShengYiJingEditorialBot/1.0 "
        "(original summaries; source attribution; contact via project repository)"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.8",
}


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


def clean_text(value: str, limit: int = 1_000) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def fetch_public_source_notes(url: str) -> dict:
    """Extract bounded public facts without bypassing access controls."""
    if urlparse(url).hostname != SOURCE_HOST:
        return {"notes": "", "media": []}

    response = requests.get(url, headers=HEADERS, timeout=25)
    if response.status_code in {401, 403}:
        return {"notes": "", "media": [], "restricted": True}
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    title = clean_text(soup.find("h1").get_text(" ", strip=True) if soup.find("h1") else "", 240)
    meta = soup.find("meta", attrs={"name": "description"})
    description = clean_text(meta.get("content", "") if meta else "", 500)
    notes = [f"标题：{title}", f"公开简介：{description}"]

    for element in soup.select("h2, h3, article p, main p"):
        text = clean_text(element.get_text(" ", strip=True), 700)
        if not text:
            continue
        if re.search(r"premium|unlock|sign in|log in|full article", text, re.I):
            break
        notes.append(text)
        if sum(len(item) for item in notes) >= MAX_SOURCE_NOTES:
            break

    media = []
    for iframe in soup.find_all("iframe", src=True):
        src = urljoin(url, iframe["src"])
        host = (urlparse(src).hostname or "").lower()
        if host in {"www.youtube.com", "youtube.com", "player.vimeo.com"}:
            media.append(
                {
                    "type": "video",
                    "url": src,
                    "caption": "项目相关公开视频",
                    "sourceUrl": url,
                    "origin": "embeddable-video",
                }
            )

    return {
        "notes": "\n".join(notes)[:MAX_SOURCE_NOTES],
        "media": media[:3],
        "restricted": False,
    }


def fetch_official_media(website: str) -> list[dict]:
    """Reference an official-site preview image without downloading it."""
    if not website or urlparse(website).scheme not in {"http", "https"}:
        return []
    try:
        response = requests.get(website, headers=HEADERS, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        meta = (
            soup.find("meta", property="og:image")
            or soup.find("meta", attrs={"name": "twitter:image"})
        )
        image_source = meta.get("content", "") if meta else ""
        if not image_source:
            image = soup.find(
                "img",
                src=lambda value: value
                and not value.startswith("data:")
                and not value.endswith(".svg"),
            )
            image_source = image.get("src", "") if image else ""
        if not image_source:
            return []
        image_url = urljoin(response.url, image_source)
        if urlparse(image_url).scheme not in {"http", "https"}:
            return []
        image_host = (urlparse(image_url).hostname or "").lower()
        if any(
            image_host == blocked or image_host.endswith(f".{blocked}")
            for blocked in BLOCKED_MEDIA_HOSTS
        ):
            return []
        return [
            {
                "type": "image",
                "url": image_url,
                "caption": "项目官网公开展示图",
                "alt": "项目官网展示图",
                "sourceUrl": website,
                "origin": "official-site",
            }
        ]
    except requests.RequestException:
        return []


def normalize_media(media: list[dict]) -> list[dict]:
    """Keep only approved official media and explicitly attributed source images."""
    approved = []
    for item in media:
        media_url = clean_text(item.get("url"), 2_000)
        source_url = clean_text(item.get("sourceUrl"), 2_000)
        parsed = urlparse(media_url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in {"http", "https"}:
            continue

        media_type = item.get("type")
        origin = item.get("origin")
        if media_type == "image":
            is_blocked_host = any(
                host == blocked or host.endswith(f".{blocked}")
                for blocked in BLOCKED_MEDIA_HOSTS
            )
            official_image = origin == "official-site" and not is_blocked_host
            attributed_source = (
                origin == "source-attributed"
                and item.get("usage") == "non-commercial-attributed"
                and urlparse(source_url).hostname == SOURCE_HOST
                and (
                    host == "d1coqmn8qm80r4.cloudfront.net"
                    or host == SOURCE_HOST
                )
            )
            if not official_image and not attributed_source:
                continue
        elif media_type == "video":
            if origin != "embeddable-video" or host not in {
                "www.youtube.com",
                "youtube.com",
                "player.vimeo.com",
            }:
                continue
        elif media_type == "video-file":
            if origin != "official-site-video" or not re.search(
                r"\.(mp4|webm)(?:$|\?)", media_url, re.I
            ):
                continue
        else:
            continue

        approved.append(
            {
                "type": media_type,
                "url": media_url,
                "caption": clean_text(item.get("caption"), 180),
                "alt": clean_text(item.get("alt"), 180),
                "sourceUrl": source_url,
                "origin": origin,
                "poster": clean_text(item.get("poster"), 2_000),
                "usage": clean_text(item.get("usage"), 80),
            }
        )
    return approved[:8]


def build_prompt(project: dict, source_notes: str) -> str:
    facts = {
        key: project.get(key)
        for key in (
            "nameZh",
            "name",
            "summary",
            "revenue",
            "businessModel",
            "insight",
            "productArch",
            "businessLoop",
            "chinaOpportunity",
            "getStartedPath",
        )
    }
    return f"""你是“AI生意经”的资深中文商业编辑。请将以下资料写成微信公众号风格的原创案例文章。

要求：
- 只使用资料中的事实；数字无法核实时标注“据来源页披露”。
- 不逐句翻译，不复刻来源文章结构，不长篇引用。
- 约2400—3600个中文字符，6—8节，适合手机阅读。
- 开头用具体场景或关键决策制造画面感；正文必须覆盖产品、渠道、收入、运营转折、风险与中国市场验证。
- 每节至少包含一个具体事实、数字、动作或因果关系，避免空泛口号。
- 返回JSON对象，字段为 title、dek、opening、keyFacts、sections、conclusion、riskNote。
- keyFacts 是 label/value 对象数组。
- sections 是 heading、paragraphs数组、callout 字符串组成的对象数组。

结构化项目资料：
{json.dumps(facts, ensure_ascii=False, indent=2)}

来源页公开事实笔记：
{source_notes or "无额外公开笔记，仅使用结构化资料。"}"""


def call_cloudflare(project: dict, source_notes: str) -> tuple[dict | None, str]:
    token = os.getenv("EDITORIAL_API_TOKEN", "")
    endpoint = os.getenv("CLOUDFLARE_EDITORIAL_ENDPOINT", DEFAULT_EDITORIAL_ENDPOINT)
    if not token:
        return None, "cloudflare-token-missing"
    try:
        response = requests.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"project": project, "sourceNotes": source_notes},
            timeout=120,
        )
        if response.status_code != 200:
            return None, f"cloudflare-http-{response.status_code}"
        payload = response.json()
        article = payload.get("article")
        if isinstance(article, dict) and isinstance(article.get("sections"), list):
            return article, "cloudflare-workers-ai"
    except (requests.RequestException, ValueError):
        pass
    return None, "cloudflare-invalid-response"


def call_deepseek(project: dict, source_notes: str) -> tuple[dict | None, str]:
    token = os.getenv("DEEPSEEK_API_KEY", "")
    if not token:
        return None, "deepseek-token-missing"
    try:
        response = requests.post(
            "https://api.deepseek.com/chat/completions",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "messages": [
                    {
                        "role": "system",
                        "content": "只返回合法JSON。文章必须原创，不得逐句翻译或复刻来源文本。",
                    },
                    {"role": "user", "content": build_prompt(project, source_notes)},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.55,
                "max_tokens": 3000,
            },
            timeout=120,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        article = json.loads(content)
        if isinstance(article, dict) and isinstance(article.get("sections"), list):
            return article, "deepseek"
    except (requests.RequestException, KeyError, ValueError, TypeError):
        pass
    return None, "deepseek-invalid-response"


def normalize_article(project: dict, article: dict, provider: str, media: list[dict]) -> dict:
    sections = []
    for section in article.get("sections", [])[:8]:
        paragraphs = [
            clean_text(paragraph, 1_200)
            for paragraph in section.get("paragraphs", [])[:4]
            if clean_text(paragraph)
        ]
        if paragraphs:
            sections.append(
                {
                    "heading": clean_text(section.get("heading"), 80),
                    "paragraphs": paragraphs,
                    "callout": clean_text(section.get("callout"), 300),
                }
            )

    key_facts = []
    for fact in article.get("keyFacts", [])[:6]:
        label = clean_text(fact.get("label"), 30)
        value = clean_text(fact.get("value"), 100)
        if label and value:
            key_facts.append({"label": label, "value": value})

    total_chars = sum(
        len(paragraph)
        for section in sections
        for paragraph in section.get("paragraphs", [])
    )
    if len(sections) < 6 or total_chars < 1_600:
        steps = [
            clean_text(step, 600)
            for step in project.get("getStartedPath", [])
            if clean_text(step)
        ]
        sections = [
            {
                "heading": "先看清：它解决的不是一个“大问题”",
                "paragraphs": [
                    clean_text(
                        project.get("summary")
                        or f"{project.get('nameZh', '这个项目')}从一个具体需求切入。",
                        800,
                    ),
                    clean_text(
                        project.get("insight")
                        or "它的价值不在概念新，而在于把一段麻烦、低效的流程做得更简单。",
                        1_000,
                    ),
                    "对小团队而言，这种切口比追逐宽泛市场更现实：用户是谁、为什么付费、产品交付什么，都能在较短时间内被验证。",
                ],
                "callout": "先找到一群愿意为结果付费的人，再决定要不要把产品做大。",
            },
            {
                "heading": "收入从哪里来：把交付方式变成商业模式",
                "paragraphs": [
                    clean_text(
                        project.get("businessModel")
                        or "项目通过清晰的产品或服务交付获得收入。",
                        1_000,
                    ),
                    f"从系统路径看，它可以被概括为：{clean_text(project.get('productArch') or '需求进入 ➔ 核心交付 ➔ 收款 ➔ 持续服务', 900)}。",
                    "这里值得借鉴的并不是某一个页面或功能，而是把用户获得结果的全过程拆成可重复执行的节点，再让收费发生在价值最明确的位置。",
                ],
                "callout": "产品只是载体，真正要设计的是“用户为什么持续付费”的路径。",
            },
            {
                "heading": "增长闭环：流量、成交与留存如何接起来",
                "paragraphs": [
                    f"现有资料给出的商业闭环是：{clean_text(project.get('businessLoop') or '内容获客 ➔ 产品体验 ➔ 付费转化 ➔ 服务留存', 1_000)}。",
                    "这套闭环的重点，是让获客内容与产品价值保持一致。用户因为一个具体问题而来，第一次体验就应该看到与这个问题直接相关的结果，而不是先面对复杂的功能清单。",
                    "早期阶段不必同时铺开所有渠道。选择一个目标用户最集中的内容平台或线下场景，持续观察咨询、试用、付费和复购四个数字，通常比追求泛流量更有效。",
                ],
                "callout": "获客不是终点；能够解释每一次流失发生在哪里，闭环才真正成立。",
            },
            {
                "heading": "放到中国市场，应该改什么",
                "paragraphs": [
                    clean_text(
                        project.get("chinaOpportunity")
                        or "中国市场存在相似需求，但需要重新验证渠道、支付和服务方式。",
                        1_000,
                    ),
                    "本土化不只是翻译界面。还要重新考虑用户习惯、微信生态、支付方式、行业合规、售后响应和内容渠道。海外案例能证明需求可能存在，却不能替代国内的一手访谈。",
                    "更稳妥的做法，是先锁定一个城市、一个行业或一个高频使用场景，用小范围交付换取真实反馈，再根据付费数据决定是否扩大。",
                ],
                "callout": "复制的是验证方法，不是照搬对方的产品外壳。",
            },
            {
                "heading": "三步启动：先跑出一个小闭环",
                "paragraphs": steps[:3]
                or [
                    "第一步：访谈10位目标用户，记录他们现在如何解决问题，以及愿意为什么结果付费。",
                    "第二步：用现成工具搭建只完成一个核心任务的最小版本，并向首批用户收费。",
                    "第三步：复盘获客、交付和复购数据，只增加能够改善转化或留存的功能。",
                ],
                "callout": "第一版的任务不是完整，而是尽快得到真实付费反馈。",
            },
            {
                "heading": "这个案例真正值得带走的东西",
                "paragraphs": [
                    "案例的意义，不是证明任何人都能获得同样收入，而是展示一个具体需求如何被组织成产品、获客和收费流程。",
                    "如果准备进入类似方向，优先验证用户痛点、支付意愿和单位经济模型。营收数字可以激发兴趣，但持续经营最终取决于交付质量、获客成本和留存。",
                ],
                "callout": "把案例当作假设来源，而不是成功保证。",
            },
        ]

    return {
        "projectId": project["id"],
        "slug": project.get("slug") or project["id"],
        "title": clean_text(article.get("title") or project.get("nameZh"), 100),
        "dek": clean_text(article.get("dek") or project.get("summary"), 240),
        "opening": clean_text(
            article.get("opening")
            or (
                f"{project.get('nameZh', '这个项目')}从一个明确需求切入，"
                f"{project.get('summary', '并把它组织成可收费、可重复的交付流程。')}"
            ),
            1_200,
        ),
        "keyFacts": key_facts,
        "sections": sections,
        "conclusion": clean_text(
            article.get("conclusion")
            or "这个案例提供的是验证思路，而不是成功保证。先验证真实需求、付费意愿与单位经济模型，再决定是否扩大投入。",
            1_200,
        ),
        "riskNote": clean_text(
            article.get("riskNote")
            or "来源中的营收、团队和增长数据可能随时间变化，请在决策前再次核验。",
            600,
        ),
        "media": normalize_media(media),
        "source": {
            "name": "Starter Story",
            "url": project.get("url", ""),
            "notice": "本文依据来源页公开事实与本站结构化资料进行原创编辑，不是原文翻译。",
        },
        "website": project.get("website", ""),
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "provider": provider,
        "status": "pilot",
    }


def generate_article(project: dict) -> dict | None:
    source = fetch_public_source_notes(project.get("url", ""))
    media = fetch_official_media(project.get("website", "")) + source.get("media", [])

    article, provider = call_cloudflare(project, source.get("notes", ""))
    if not article:
        print(f"  [WARN] {provider}; falling back to DeepSeek")
        article, provider = call_deepseek(project, source.get("notes", ""))
    if not article:
        print(f"  [ERROR] Article generation failed: {provider}")
        return None
    return normalize_article(project, article, provider, media)


def upsert_articles(projects: list[dict], limit: int = 5) -> list[dict]:
    existing = load_json(ARTICLES_FILE, [])
    by_id = {item["projectId"]: item for item in existing if item.get("projectId")}
    generated = []
    for project in projects[:limit]:
        print(f"[ARTICLE] {project.get('nameZh') or project.get('name')}")
        article = generate_article(project)
        if article:
            by_id[project["id"]] = article
            generated.append(article)
        time.sleep(REQUEST_DELAY)
    ordered_ids = [item.get("projectId") for item in existing]
    ordered_ids.extend(item["projectId"] for item in generated if item["projectId"] not in ordered_ids)
    save_json(ARTICLES_FILE, [by_id[item_id] for item_id in ordered_ids if item_id in by_id])
    return generated


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--ids", nargs="*", default=[])
    args = parser.parse_args()

    projects = load_json(PROJECTS_FILE, [])
    if args.ids:
        wanted = set(args.ids)
        projects = [project for project in projects if project.get("id") in wanted]
    else:
        published = {
            item.get("projectId")
            for item in load_json(ARTICLES_FILE, [])
            if item.get("projectId")
        }
        projects = [
            project
            for project in projects
            if project.get("id") not in published
            and "/stories/" in project.get("url", "")
        ]
    generated = upsert_articles(projects, max(0, args.limit))
    print(f"[SUCCESS] Generated {len(generated)} case articles")


if __name__ == "__main__":
    main()
