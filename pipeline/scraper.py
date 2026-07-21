#!/usr/bin/env python3
"""
AI生意经 - 自动采集与拆解流水线
支持：DeepSeek API / Google Gemini API (免费) / OpenAI API
"""

import os
import json
import time
import hashlib
import datetime
import requests
from bs4 import BeautifulSoup
from pathlib import Path

# ========== CONFIG ==========
BASE_URL = "https://www.starterstory.com"
DATA_DIR = Path(__file__).parent / "data"
SEEN_FILE = DATA_DIR / "seen_ids.json"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "projects_live.json"

# API Keys 环境变量（按优先级读取）
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")  # 推荐：DeepSeek API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")      # 推荐：Google Gemini (免费)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")      # OpenAI API

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

REQUEST_DELAY = 3  # 秒

def load_seen_ids():
    if SEEN_FILE.exists():
        with open(SEEN_FILE) as f:
            return set(json.load(f))
    return set()

def save_seen_ids(ids):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SEEN_FILE, "w") as f:
        json.dump(list(ids), f)

def make_id(name):
    return hashlib.md5(name.lower().encode()).hexdigest()[:12]

def fetch_page(url, retries=3):
    for i in range(retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            print(f"  [WARN] Attempt {i+1} failed for {url}: {e}")
            time.sleep(REQUEST_DELAY * 2)
    return None

def scrape_listing_page():
    print("[INFO] Fetching global listings...")
    html = fetch_page(f"{BASE_URL}/data")
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    projects = []

    rows = soup.find_all("tr", class_=lambda c: c and "border-b" in c)
    for row in rows:
        try:
            name_el = row.find("span", class_=lambda c: c and "font-bold" in str(c))
            if not name_el:
                continue
            name = name_el.get_text(strip=True)

            rev_el = row.find("span", class_=lambda c: c and "bg-emerald-50" in str(c))
            revenue_str = rev_el.get_text(strip=True) if rev_el else "Unknown"

            link_el = row.find("a", href=True)
            url = BASE_URL + link_el["href"] if link_el and link_el["href"].startswith("/") else ""

            cells = row.find_all("td")
            startup_info = ""
            if len(cells) >= 3:
                startup_info = cells[-1].get_text(strip=True)

            projects.append({
                "name": name,
                "revenue": revenue_str,
                "startupInfo": startup_info,
                "url": url,
                "id": make_id(name),
                "scrapedAt": datetime.datetime.now().isoformat()
            })
        except Exception as e:
            print(f"  [WARN] Row parse error: {e}")
            continue

    print(f"[INFO] Found {len(projects)} projects on listing page")
    return projects

def scrape_detail_page(url):
    if not url:
        return {}

    time.sleep(REQUEST_DELAY)
    html = fetch_page(url)
    if not html:
        return {}

    soup = BeautifulSoup(html, "html.parser")
    detail = {}

    rev_blocks = soup.find_all(string=lambda s: s and "$" in s and "/mo" in s)
    if rev_blocks:
        detail["revenueDetail"] = rev_blocks[0].strip()

    desc_el = soup.find("meta", attrs={"name": "description"})
    if desc_el:
        detail["metaDesc"] = desc_el.get("content", "")

    return detail

# ========== AI ANALYSIS ==========
def generate_chinese_analysis(project):
    prompt = f"""你是「AI生意经」的内容编辑，负责将全球热门创业案例以中国创业者视角进行深度解读。

项目信息：
- 项目名称：{project.get('name', '')}
- 月营收：{project.get('revenue', '')}
- 简介：{project.get('metaDesc', project.get('name', ''))}

请用中文完成以下分析，尤其是帮助中国用户能快速了解模仿上手：

1. 创意亮点：这个生意为什么能成功？核心洞察是什么？
2. 商业模式：如何赚钱？定价策略？客户群体？
3. 中国机会：国内是否存在同类需求？如何本土化落地？
4. 产品架构(productArch)：该项目的核心技术/服务系统是由哪些模块连接的（例如：前端上传 ➔ 后端Python ➔ 大模型API ➔ Excel导出）？
5. 商业闭环逻辑(businessLoop)：流量从哪里来？到什么体验载体？怎么诱导付费？怎么留存？
6. 3步上手路径(getStartedPath)：按一、二、三步，写出具体的、开箱即用的模仿实践步骤。

请以JSON格式输出：
{{
  "summary": "一句话总结（30字以内）",
  "insight": "创意亮点分析",
  "businessModel": "商业模式描述",
  "chinaOpportunity": "中国机会分析",
  "productArch": "用 ➔ 符号连接的架构步骤，如：输入表单 ➔ 大模型API ➔ 支付模块",
  "businessLoop": "【引流】：... ➔ 【产品】：... ➔ 【变现】：...",
  "getStartedPath": [
    "第一步：具体做什么（50字左右）",
    "第二步：具体做什么（50字左右）",
    "第三步：具体做什么（50字左右）"
  ],
  "replicabilityScore": 评分1-10,
  "difficulty": "极低/低/中/高",
  "tags": ["标签1", "标签2"]
}}"""

    if DEEPSEEK_API_KEY:
        print("  [AI] Using DeepSeek API...")
        return call_deepseek(prompt)
    elif GEMINI_API_KEY:
        print("  [AI] Using Gemini API...")
        return call_gemini(prompt)
    elif OPENAI_API_KEY:
        print("  [AI] Using OpenAI API...")
        return call_openai(prompt)
    else:
        print("  [WARN] No AI API key configured. Returning placeholder.")
        return {
            "summary": f"{project.get('name','')}，月收入{project.get('revenue','')}",
            "insight": "AI解读功能需要配置 DEEPSEEK_API_KEY 或 GEMINI_API_KEY",
            "businessModel": "按使用付费",
            "chinaOpportunity": "请配置 API Key 启动完整分析",
            "productArch": "输入端 ➔ 处理端 ➔ 支付结算 ➔ 交付端",
            "businessLoop": "【引流】：自媒体内容曝光 ➔ 【产品】：极简页面 ➔ 【变现】：按次充值",
            "getStartedPath": [
                "第一步：克隆基础 Web 前端模板，连接国内主流模型 API 调试提示词。",
                "第二步：设置微信或支付宝等免签收款通道，进行测试闭环。",
                "第三步：在小红书、抖音制作解压或技巧类演示视频获取自然流量。"
            ],
            "replicabilityScore": 7,
            "difficulty": "中",
            "tags": ["待分析"]
        }

def call_deepseek(prompt):
    """调用 DeepSeek API (兼容 OpenAI 规范)"""
    try:
        url = "https://api.deepseek.com/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
        }
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": "You are a helpful business and tech analyst assistant. Respond strictly in valid JSON format."},
                {"role": "user", "content": prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.7
        }
        resp = requests.post(url, json=payload, headers=headers, timeout=45)
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception as e:
        print(f"  [ERROR] DeepSeek API error: {e}")
        return {}

def call_gemini(prompt):
    """调用 Google Gemini API (免费)"""
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        }
        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except Exception as e:
        print(f"  [ERROR] Gemini API error: {e}")
        return {}

def call_openai(prompt):
    """调用 OpenAI API"""
    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"  [ERROR] OpenAI API error: {e}")
        return {}

def run_pipeline():
    print(f"\n{'='*60}")
    print(f"AI生意经 采集与拆解流水线 | {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}\n")

    seen_ids = load_seen_ids()
    print(f"[INFO] Already seen: {len(seen_ids)} projects")

    projects = scrape_listing_page()
    if not projects:
        print("[WARN] No projects found. Exiting.")
        return

    new_projects = [p for p in projects if p["id"] not in seen_ids]
    print(f"[INFO] New projects: {len(new_projects)}")

    if not new_projects:
        print("[INFO] No new projects. Pipeline complete.")
        return

    results = []
    for i, project in enumerate(new_projects[:10]):
        print(f"\n[{i+1}/{min(len(new_projects),10)}] Processing: {project['name']}")

        if project.get("url"):
            detail = scrape_detail_page(project["url"])
            project.update(detail)

        print(f"  Generating AI analysis...")
        analysis = generate_chinese_analysis(project)
        project.update(analysis)

        project["updatedAt"] = datetime.date.today().isoformat()
        project["featured"] = False

        results.append(project)
        seen_ids.add(project["id"])
        time.sleep(REQUEST_DELAY)

    save_seen_ids(seen_ids)

    existing = []
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE) as f:
            existing = json.load(f)

    all_projects = results + existing
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_projects, f, ensure_ascii=False, indent=2)

    print(f"\n[SUCCESS] Pipeline complete!")
    print(f"  - New projects processed: {len(results)}")
    print(f"  - Total in database: {len(all_projects)}")

    if results:
        generate_content_drafts(results)

def generate_content_drafts(projects):
    draft_dir = Path(__file__).parent / "drafts"
    draft_dir.mkdir(exist_ok=True)

    for p in projects:
        date_str = datetime.date.today().strftime("%Y%m%d")

        wechat_draft = f"""# 【AI生意经】{p.get('name', '')}：月入{p.get('revenue', '')}，国内可完美复制！

> 日期：{p.get('updatedAt', '')} | 可复制指数：{p.get('replicabilityScore', '')}/10

---

## 🏗️ 极简商业逻辑与产品架构

本项目之所以能实现极低成本启动、高利润产出，核心在于极其巧妙的产品和技术路径。以下是该项目的**产品与系统架构**：

**{p.get('productArch', '')}**

而它的**商业闭环逻辑**则遵循以下运转模型：

**{p.get('businessLoop', '')}**

---

## 💡 创意核心与痛点解析

{p.get('insight', '（待AI分析）')}

## 🛠️ 三步模仿上手指南

如果你也想快速模仿启动一个类似的项目，可以直接参考以下实践路径：

{p.get('getStartedPath', ['第一步：搭建页面', '第二步：接入服务', '第三步：开始获客'])[0]}
{p.get('getStartedPath', ['第一步：搭建页面', '第二步：接入服务', '第三步：开始获客'])[1]}
{p.get('getStartedPath', ['第一步：搭建页面', '第二步：接入服务', '第三步：开始获客'])[2]}

## 🇨🇳 中国本土化落地机会

{p.get('chinaOpportunity', '（待分析）')}

---

**关注「AI生意经」**，每周发现 3-5 个全球热门生意，提供最透彻的技术架构与上手拆解。

#创业 #副业 #生意经 #商业模式
"""

        wechat_file = draft_dir / f"{date_str}_{p['id']}_wechat.md"
        with open(wechat_file, "w", encoding="utf-8") as f:
            f.write(wechat_draft)

        xhs_draft = f"""📊 月入{p.get('revenue', '')} | 普通人如何复制？

【{p.get('name', '')}】商业拆解！

一句话：{p.get('summary', '')}

🏗️ 产品架构流：
{p.get('productArch', '')}

🔄 商业闭环：
{p.get('businessLoop', '')}

🚀 3步快速上手：
1️⃣ {p.get('getStartedPath', ['第一步'])[0][:45]}...
2️⃣ {p.get('getStartedPath', ['','第二步'])[1][:45]}...
3️⃣ {p.get('getStartedPath', ['','','第三步'])[2][:45]}...

🇨🇳 国内落地建议：
{p.get('chinaOpportunity', '')[:65]}...

可复制指数：{'⭐' * min(int(p.get('replicabilityScore', 7)), 5)}/10

👇 想获取完整实操拆解？关注「AI生意经」

#副业 #创业 #生意经 #独立开发 #产品架构
"""

        xhs_file = draft_dir / f"{date_str}_{p['id']}_xiaohongshu.md"
        with open(xhs_file, "w", encoding="utf-8") as f:
            f.write(xhs_draft)

    print(f"\n[INFO] Content drafts saved to: {draft_dir}")

if __name__ == "__main__":
    run_pipeline()
