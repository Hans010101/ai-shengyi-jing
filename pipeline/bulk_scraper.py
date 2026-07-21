#!/usr/bin/env python3
"""
AI生意经 - 全量批处理采集系统
=============================
数据来源：从 Starter Story sitemap 获取全部项目 URL 列表
处理模式：分30批，每批100个，支持断点续传
AI拆解：优先 DeepSeek → Gemini → OpenAI → 无AI兜底
"""

import os, sys, json, time, re, hashlib, datetime, argparse
import requests
from bs4 import BeautifulSoup
from pathlib import Path

# ===== PATHS =====
ROOT = Path(__file__).parent.parent
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

INDEX_FILE   = DATA_DIR / "all_projects_index.json"   # 全量项目名单
SEEN_FILE    = DATA_DIR / "seen_ids.json"              # 已处理过的项目ID
OUTPUT_FILE  = ROOT / "data" / "projects_live.json"   # 最终输出
DRAFT_DIR    = Path(__file__).parent / "drafts"
DRAFT_DIR.mkdir(parents=True, exist_ok=True)

# ===== API KEYS =====
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY   = os.getenv("OPENAI_API_KEY", "")

SITEMAP_URL = "https://d1coqmn8qm80r4.cloudfront.net/sitemaps/sitemap.xml.gz"
BASE_URL    = "https://www.starterstory.com"
BATCH_SIZE  = 100
REQUEST_DELAY = 2  # seconds between requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# ===== NICHE DETECTION =====
NICHE_KEYWORDS = {
    "AI工具": ["ai", "gpt", "llm", "machine learning", "artificial", "chatbot", "openai", "claude"],
    "SaaS": ["saas", "software", "platform", "dashboard", "crm", "analytics"],
    "内容/媒体": ["newsletter", "podcast", "media", "content", "blog", "education", "course"],
    "电商/DTC": ["shop", "store", "ecommerce", "product", "brand", "amazon", "etsy"],
    "开发者工具": ["api", "developer", "code", "sdk", "cli", "devtools", "github"],
    "营销工具": ["marketing", "seo", "email", "leads", "growth", "ads", "social"],
    "金融/支付": ["finance", "payment", "accounting", "invoice", "bank", "fintech"],
    "健康/生活": ["health", "fitness", "wellness", "food", "recipe", "lifestyle"],
    "B2B服务": ["b2b", "enterprise", "consulting", "agency", "service"],
    "游戏/娱乐": ["game", "gaming", "entertainment", "fun", "hobby"],
}

def detect_niche(text):
    text_lower = (text or "").lower()
    for niche, keywords in NICHE_KEYWORDS.items():
        if any(k in text_lower for k in keywords):
            return niche
    return "其他"

def make_id(slug):
    return hashlib.md5(slug.encode()).hexdigest()[:12]

def load_json(path, default):
    if Path(path).exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ===== STEP 1: BUILD INDEX FROM SITEMAP =====
def build_index():
    """从 sitemap 获取全量项目 URL，构建索引（只需运行一次）"""
    if INDEX_FILE.exists():
        existing = load_json(INDEX_FILE, [])
        print(f"[INFO] Index already exists with {len(existing)} projects. Use --rebuild-index to refresh.")
        return existing

    print("[INFO] Downloading sitemap...")
    import gzip, io

    resp = requests.get(SITEMAP_URL, timeout=30, headers=HEADERS)
    resp.raise_for_status()
    xml_content = gzip.decompress(resp.content).decode("utf-8")

    all_urls = re.findall(r'<loc>(.*?)</loc>', xml_content)
    lastmods = re.findall(r'<lastmod>(.*?)</lastmod>', xml_content)

    # Filter for story/business pages
    story_entries = []
    for i, url in enumerate(all_urls):
        if "/stories/" in url or "/businesses/" in url:
            slug = url.rstrip("/").split("/")[-1]
            lastmod = lastmods[i] if i < len(lastmods) else ""
            story_entries.append({
                "url": url,
                "slug": slug,
                "id": make_id(slug),
                "lastmod": lastmod[:10] if lastmod else "",
                "processed": False
            })

    print(f"[INFO] Found {len(story_entries)} project URLs in sitemap")
    save_json(INDEX_FILE, story_entries)
    return story_entries

# ===== STEP 2: SCRAPE PROJECT PAGE =====
def scrape_project_page(url):
    """从单个项目页面提取公开可见的基础信息"""
    try:
        time.sleep(REQUEST_DELAY)
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code == 403 or resp.status_code == 401:
            return {"_auth_required": True}
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        data = {"url": url}

        # Title
        h1 = soup.find("h1")
        data["name"] = h1.get_text(strip=True) if h1 else ""

        # Meta description
        meta_desc = soup.find("meta", attrs={"name": "description"})
        data["description"] = meta_desc.get("content", "") if meta_desc else ""

        # Revenue patterns (e.g. "$10K/mo", "$1.2M/mo")
        rev_pattern = re.compile(r'\$[\d,.]+[KkMm]?(?:\s*/\s*(?:mo|month|year|yr))?', re.IGNORECASE)
        all_text = soup.get_text()
        rev_matches = rev_pattern.findall(all_text)
        data["revenue"] = rev_matches[0] if rev_matches else "未披露"

        # OG image
        og_img = soup.find("meta", property="og:image")
        data["image"] = og_img.get("content", "") if og_img else ""

        # Tags / niche from meta keywords or categories
        keywords_meta = soup.find("meta", attrs={"name": "keywords"})
        data["keywords"] = keywords_meta.get("content", "") if keywords_meta else ""

        # Business domain from URL if embedded
        domain_match = re.search(r'(?:website|domain|url)[:\s]+([a-z0-9.-]+\.[a-z]{2,})', all_text[:3000], re.IGNORECASE)
        data["domain"] = domain_match.group(1) if domain_match else ""

        # Extract external links (website, twitter, github)
        links = soup.find_all("a", href=True)
        github_links = []
        twitter_links = []
        external_links = []
        for a in links:
            href = a["href"].strip().lower()
            if "github.com/" in href and not any(x in href for x in ["/sponsors", "/features", "/about", "/pricing", "/join", "/login"]):
                github_links.append(a["href"])
            elif ("twitter.com/" in href or "x.com/" in href) and not any(x in href for x in ["/share", "/intent", "/search", "/status", "/privacy"]):
                twitter_links.append(a["href"])
            elif href.startswith("http") and not any(x in href for x in ["starterstory.com", "google.com", "facebook.com", "linkedin.com", "instagram.com", "youtube.com"]):
                external_links.append(a["href"])

        data["github_url"] = github_links[0] if github_links else ""
        data["twitter_url"] = twitter_links[0] if twitter_links else ""
        data["website"] = external_links[0] if external_links else (f"https://{data['domain']}" if data["domain"] else "")

        return data

    except Exception as e:
        return {"_error": str(e), "url": url}

def generate_analysis(project_info):
    """调用 AI 生成中文商业拆解"""
    name = project_info.get("name") or project_info.get("slug", "Unknown")
    desc = project_info.get("description", "")
    revenue = project_info.get("revenue", "未披露")
    keywords = project_info.get("keywords", "")
    default_web = project_info.get("website", "")
    default_tw = project_info.get("twitter_url", "")
    default_gh = project_info.get("github_url", "")

    prompt = f"""你是「AI生意经」的首席商业分析师，专门从中国创业者视角深度解读全球热门创业案例。

项目基本信息：
- 项目名/Slug: {name}
- 月营收: {revenue}
- 项目描述: {desc}
- 关键词: {keywords}
- 爬虫抓取到的官网网址: {default_web}
- 爬虫抓取到的X(Twitter)账号: {default_tw}
- 爬虫抓取到的GitHub仓库: {default_gh}

请以中文完成以下分析，帮助中国创业者能快速了解并模仿上手：

1. 用一句话（30字以内）总结这是什么项目，怎么赚钱
2. 分析核心商业模式和赚钱方式
3. 分析中国市场的同类机会和本土化路径
4. 绘制产品架构流（用 ➔ 连接各模块，例如：用户注册 ➔ AI处理 ➔ 导出结果 ➔ 付费解锁）
5. 描述商业闭环（用【引流】➔【产品】➔【变现】➔【留存】格式）
6. 给出3步可执行的模仿上手路径（每步50-80字，具体可操作）
7. 尽可能提供该项目的官网地址(website)、官方X链接(twitter_url)、开源仓库(github_url)。
   如果没有抓取到，且你（AI）已知该知名项目的官网、X账号或GitHub，请根据你已知的信息补齐；如果实在没有则填入空字符串。

请严格按以下JSON格式输出，不要输出任何JSON以外的内容：
{{
  "summary": "一句话总结",
  "insight": "核心洞察（100字以内）",
  "businessModel": "商业模式描述（80字以内）",
  "chinaOpportunity": "中国机会分析（80字以内）",
  "productArch": "模块1 ➔ 模块2 ➔ 模块3 ➔ 模块4",
  "businessLoop": "【引流】xxx ➔ 【产品】xxx ➔ 【变现】xxx ➔ 【留存】xxx",
  "getStartedPath": [
    "第一步：...",
    "第二步：...",
    "第三步：..."
  ],
  "replicabilityScore": 8,
  "difficulty": "低",
  "startupCost": "$500-2000",
  "timeToRevenue": "1-3个月",
  "tags": ["AI工具", "SaaS"],
  "website": "官网网址或空字",
  "twitter_url": "Twitter链接或空字",
  "github_url": "GitHub链接或空字"
}}"""

    if DEEPSEEK_API_KEY:
        result = call_deepseek(prompt)
        if result:
            return result

    if GEMINI_API_KEY:
        result = call_gemini(prompt)
        if result:
            return result

    if OPENAI_API_KEY:
        result = call_openai(prompt)
        if result:
            return result

    # Fallback: generate basic info without AI
    niche = detect_niche(desc + " " + keywords + " " + name)
    return {
        "summary": f"{name}，月收入{revenue}",
        "insight": desc[:100] if desc else f"这是一个{niche}领域的创业项目",
        "businessModel": "订阅制/按使用付费",
        "chinaOpportunity": f"国内{niche}领域存在类似需求，可本土化落地",
        "productArch": "用户入口 ➔ 核心功能 ➔ 支付结算 ➔ 交付服务",
        "businessLoop": "【引流】：内容/口碑传播 ➔ 【产品】：SaaS服务 ➔ 【变现】：订阅付费 ➔ 【留存】：数据积累",
        "getStartedPath": [
            "第一步：调研国内同类产品现状，寻找差异化切入点，用3天快速搭建MVP验证需求。",
            "第二步：用低代码工具或外包快速上线基础版本，接入微信/支付宝支付，完成收款闭环。",
            "第三步：在小红书、抖音发布使用演示视频，获取第一批种子用户并收集反馈迭代产品。"
        ],
        "replicabilityScore": 7,
        "difficulty": "中",
        "startupCost": "$1000-5000",
        "timeToRevenue": "2-4个月",
        "tags": [niche, "创业"]
    }

def call_deepseek(prompt):
    try:
        url = "https://api.deepseek.com/chat/completions"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_API_KEY}"}
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": "You are a business analyst. Always respond with valid JSON only, no markdown."},
                {"role": "user", "content": prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.6,
            "max_tokens": 1000
        }
        resp = requests.post(url, json=payload, headers=headers, timeout=40)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception as e:
        print(f"    [WARN] DeepSeek error: {e}")
        return None

def call_gemini(prompt):
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": 1000}
        }
        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except Exception as e:
        print(f"    [WARN] Gemini error: {e}")
        return None

def call_openai(prompt):
    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"    [WARN] OpenAI error: {e}")
        return None

# ===== CONTENT DRAFTS =====
def generate_drafts(project):
    date_str = datetime.date.today().strftime("%Y%m%d")
    pid = project.get("id", "xxx")
    name = project.get("name", project.get("slug", "项目"))
    rev = project.get("revenue", "未披露")
    arch = project.get("productArch", "")
    loop = project.get("businessLoop", "")
    steps = project.get("getStartedPath", ["第一步", "第二步", "第三步"])
    china = project.get("chinaOpportunity", "")
    score = project.get("replicabilityScore", 7)
    insight = project.get("insight", "")

    # WeChat draft
    wechat = f"""# 【AI生意经】{name}：月入{rev}的商业密码

> 来源：全球 AI 前沿创业项目精选 | 可复制指数：{score}/10

---

## 🏗️ 产品架构与商业闭环

**系统架构：**
{arch}

**商业闭环：**
{loop}

---

## 💡 核心洞察

{insight}

## 🛠️ 三步上手路径

{steps[0] if len(steps) > 0 else '第一步：搭建MVP'}

{steps[1] if len(steps) > 1 else '第二步：获取用户'}

{steps[2] if len(steps) > 2 else '第三步：实现收入'}

## 🇨🇳 中国落地机会

{china}

---

关注「AI生意经」，每周发现全球热门生意，提供最透彻的上手拆解。

#AI创业 #副业 #生意经 #商业模式 #独立开发
"""

    # Xiaohongshu draft
    stars = "⭐" * min(int(score), 5)
    xhs = f"""月入{rev} | 普通人如何复制？🔥

【{name}】深度拆解！

一句话：{project.get('summary', '')}

🏗️ 产品架构：
{arch[:80]}...

🔄 商业闭环：
{loop[:100]}...

🚀 3步上手：
1️⃣ {steps[0][:50] if len(steps)>0 else '搭建MVP'}...
2️⃣ {steps[1][:50] if len(steps)>1 else '获取用户'}...
3️⃣ {steps[2][:50] if len(steps)>2 else '实现收入'}...

🇨🇳 国内机会：
{china[:80]}...

可复制指数：{stars}/10

👇关注「AI生意经」获取完整拆解

#副业 #创业 #AI工具 #生意经 #独立开发 #被动收入
"""

    (DRAFT_DIR / f"{date_str}_{pid}_wechat.md").write_text(wechat, encoding="utf-8")
    (DRAFT_DIR / f"{date_str}_{pid}_xhs.md").write_text(xhs, encoding="utf-8")

# ===== MAIN PIPELINE =====
def run_batch(batch_num: int, batch_size: int = BATCH_SIZE, rebuild_index: bool = False):
    print(f"\n{'='*65}")
    print(f"  AI生意经 全量迁移流水线 | 批次 {batch_num} | {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*65}")

    # Step 1: Get index
    if rebuild_index and INDEX_FILE.exists():
        INDEX_FILE.unlink()
    index = build_index()

    # Step 2: Load seen IDs
    seen_ids = set(load_json(SEEN_FILE, []))
    print(f"[INFO] Total index entries: {len(index)}")
    print(f"[INFO] Already processed: {len(seen_ids)}")

    # Step 3: Determine batch slice using unprocessed list directly
    unprocessed = [e for e in index if e["id"] not in seen_ids]
    batch = unprocessed[:batch_size]

    if not batch:
        print(f"[INFO] No projects to process. All done!")
        total = len(load_json(OUTPUT_FILE, []))
        print(f"[INFO] Current total in database: {total}")
        return

    print(f"[INFO] Unprocessed remaining: {len(unprocessed)} | Actual to process this batch: {len(batch)} projects")

    # Step 4: Process each project
    results = []
    ai_success = 0
    ai_fallback = 0

    for i, entry in enumerate(batch):
        slug = entry["slug"]
        url = entry["url"]
        pid = entry["id"]

        print(f"\n  [{i+1}/{len(batch)}] {slug}")
        print(f"    URL: {url}")

        # Scrape page
        page_data = scrape_project_page(url)

        if page_data.get("_auth_required"):
            print("    [SKIP] Auth required — using slug-only AI generation")
            page_data = {"name": slug.replace("-", " ").title(), "description": "", "revenue": "未披露"}

        if page_data.get("_error"):
            print(f"    [WARN] Scrape error: {page_data['_error']} — continuing with slug data")
            page_data = {"name": slug.replace("-", " ").title(), "description": "", "revenue": "未披露"}

        # Detect niche
        niche = detect_niche(page_data.get("description", "") + " " + page_data.get("keywords", "") + " " + slug)

        # Combine base info
        project = {
            "id": pid,
            "slug": slug,
            "url": url,
            "name": page_data.get("name") or slug.replace("-", " ").title(),
            "revenue": page_data.get("revenue", "未披露"),
            "description": page_data.get("description", ""),
            "image": page_data.get("image", ""),
            "niche": niche,
            "featured": False,
            "updatedAt": datetime.date.today().isoformat(),
            "scrapedAt": datetime.datetime.now().isoformat(),
        }

        # AI analysis
        print(f"    Calling AI analysis...")
        ai_start = time.time()
        analysis = generate_analysis(project)
        ai_elapsed = time.time() - ai_start

        if analysis.get("summary") and "配置" not in analysis.get("summary", ""):
            ai_success += 1
            ai_label = "✓ AI"
        else:
            ai_fallback += 1
            ai_label = "◎ fallback"

        print(f"    {ai_label} | {ai_elapsed:.1f}s | {analysis.get('summary', '')[:40]}")

        project.update(analysis)
        results.append(project)
        seen_ids.add(pid)

    # Step 5: Save results
    existing = load_json(OUTPUT_FILE, [])
    all_projects = results + existing

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    save_json(OUTPUT_FILE, all_projects)
    save_json(SEEN_FILE, list(seen_ids))

    # Step 6: Generate content drafts
    for p in results:
        generate_drafts(p)

    # Step 7: Report
    total_unprocessed = len([e for e in index if e["id"] not in seen_ids])
    batches_remaining = (total_unprocessed + batch_size - 1) // batch_size

    print(f"\n{'='*65}")
    print(f"  ✅ 批次 {batch_num} 完成!")
    print(f"  本批处理: {len(results)} 个项目")
    print(f"  AI成功: {ai_success} | 兜底: {ai_fallback}")
    print(f"  数据库总计: {len(all_projects)} 个项目")
    print(f"  待处理剩余: {total_unprocessed} 个 (约 {batches_remaining} 批)")
    print(f"  内容草稿: {DRAFT_DIR}")
    print(f"{'='*65}")

def run_all(batch_size: int = BATCH_SIZE):
    """连续运行所有批次直至完成（全自动无人值守模式）"""
    index = build_index()
    seen_ids = set(load_json(SEEN_FILE, []))
    unprocessed = [e for e in index if e["id"] not in seen_ids]
    total_batches = (len(unprocessed) + batch_size - 1) // batch_size

    print(f"[INFO] 全自动模式: {len(unprocessed)} 个待处理项目，共 {total_batches} 批")

    for batch_num in range(1, total_batches + 1):
        run_batch(batch_num, batch_size)
        # Reload seen_ids after each batch
        seen_ids = set(load_json(SEEN_FILE, []))
        remaining = len([e for e in index if e["id"] not in seen_ids])
        if remaining == 0:
            break
        print(f"\n[INFO] 批次 {batch_num} 完成，休眠 30 秒后继续...\n")
        time.sleep(30)

    print("\n🎉 全量迁移完成！")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI生意经 全量迁移工具")
    parser.add_argument("--batch", type=int, default=0, help="指定批次号 (1-N)，0=自动运行所有批次")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help=f"每批处理数量（默认{BATCH_SIZE}）")
    parser.add_argument("--rebuild-index", action="store_true", help="重新从sitemap构建项目索引")
    parser.add_argument("--index-only", action="store_true", help="只构建索引，不处理项目")
    args = parser.parse_args()

    if args.index_only:
        build_index()
    elif args.batch == 0:
        run_all(args.batch_size)
    else:
        run_batch(args.batch, args.batch_size, args.rebuild_index)
