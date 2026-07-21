#!/usr/bin/env python3
"""
AI生意经 - 质检与数据自动修复工具 (QC Repair Tool)
===================================================
1. 检测 data/projects_live.json 中是否有AI生成失败、被兜底的低质量项目
2. 原地优先调用 DeepSeek/Gemini API 重新生成高质量拆解
3. 自动提交并部署更新，保证全站没有“脏数据”
"""

import os, json, time, datetime
import requests
from pathlib import Path

ROOT = Path(__file__).parent.parent
DB_FILE = ROOT / "data" / "projects_live.json"

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

def is_low_quality(p):
    """质检判定：分析是否失败或包含兜底标志"""
    insight = p.get("insight", "")
    summary = p.get("summary", "")
    china_opp = p.get("chinaOpportunity", "")
    product_arch = p.get("productArch", "")
    tags = p.get("tags", [])

    # 如果有兜底文字，或缺少核心拆解字段，判定为低质量，需要重跑
    bad_keywords = ["配置", "api key", "apikey", "限额", "待分析", "无ai兜底", "分析内容"]
    
    for kw in bad_keywords:
        if kw in insight.lower() or kw in summary.lower() or kw in china_opp.lower():
            return True

    if not product_arch or "输入端" in product_arch or "核心功能" in product_arch:
        # 默认生成的普通兜底流图
        return True

    if "待分析" in tags:
        return True

    return False

def generate_perfect_analysis(p):
    """调用 API 生成完美中文分析"""
    name = p.get("name") or p.get("slug", "Unknown")
    desc = p.get("description", "")
    revenue = p.get("revenue", "未披露")
    
    prompt = f"""你是「AI生意经」的首席商业分析师，专门从中国创业者视角深度解读全球热门创业案例。

项目基本信息：
- 项目名/Slug: {name}
- 月营收: {revenue}
- 项目描述: {desc}

请以中文完成以下分析，帮助中国创业者能快速了解并模仿上手：

1. 用一句话（30字以内）总结这是什么项目，怎么赚钱
2. 分析核心商业模式和赚钱方式
3. 分析中国市场的同类机会和本土化路径
4. 绘制产品架构流（用 ➔ 连接各模块，例如：用户注册 ➔ AI处理 ➔ 导出结果 ➔ 付费解锁）
5. 描述商业闭环（用【引流】➔【产品】➔【变现】➔【留存】格式）
6. 给出3步可执行的模仿上手路径（每步50-80字，具体可操作）
7. 尽可能提供该项目的官网地址(website)、官方X链接(twitter_url)、开源仓库(github_url)。如果你已知该知名项目的官网、X账号或GitHub，请根据你已知的信息填写；如果实在没有则填入空字符串。

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

    # 依次调用配置的 API
    if DEEPSEEK_API_KEY:
        res = call_deepseek(prompt)
        if res: return res
    if GEMINI_API_KEY:
        res = call_gemini(prompt)
        if res: return res
    if OPENAI_API_KEY:
        res = call_openai(prompt)
        if res: return res
    return None

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
            "temperature": 0.5
        }
        resp = requests.post(url, json=payload, headers=headers, timeout=40)
        resp.raise_for_status()
        return json.loads(resp.json()["choices"][0]["message"]["content"])
    except Exception as e:
        print(f"      [QC] DeepSeek error: {e}")
        return None

def call_gemini(prompt):
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        }
        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except Exception as e:
        print(f"      [QC] Gemini error: {e}")
        return None

def call_openai(prompt):
    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"      [QC] OpenAI error: {e}")
        return None

def run_qc_repair():
    if not DB_FILE.exists():
        print("[ERR] projects_live.json 不存在！请先跑迁移流水线")
        return

    with open(DB_FILE, encoding="utf-8") as f:
        projects = json.load(f)

    print(f"\n==========================================")
    print(f"  🔍 AI生意经 数据大盘质检系统启动")
    print(f"  当前数据库总数: {len(projects)} 个项目")
    print(f"==========================================\n")

    # 1. 扫描低质量项目
    dirty_projects = []
    for p in projects:
        if is_low_quality(p):
            dirty_projects.append(p)

    print(f"[INFO] 扫描完毕。共发现 {len(dirty_projects)} 个需要重跑修复的项目")
    if not dirty_projects:
        print("[SUCCESS] 质检完成！当前所有项目质量均为 100% 优良状态")
        return

    # 2. 自动修复
    repaired_count = 0
    for i, p in enumerate(dirty_projects):
        name = p.get("name", "Unknown")
        print(f"\n  [{i+1}/{len(dirty_projects)}] 修复项目: {name} (ID: {p['id']})")
        
        # 重新生成完美分析
        new_analysis = generate_perfect_analysis(p)
        if new_analysis:
            p.update(new_analysis)
            p["updatedAt"] = datetime.date.today().isoformat()
            repaired_count += 1
            print(f"    ✅ 修复成功: {p.get('summary', '')[:40]}")
            time.sleep(2)  # 避免请求过频
        else:
            print(f"    ❌ 修复失败 (API调用未成功)")

    # 3. 保存回盘
    if repaired_count > 0:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(projects, f, ensure_ascii=False, indent=2)
        print(f"\n[SUCCESS] 质检完成！共成功原地修复 {repaired_count} 个低质量数据项目！")
    else:
        print(f"\n[INFO] 未成功修复任何项目，请检查您的 API Key 是否正确配置。")

if __name__ == "__main__":
    run_qc_repair()
