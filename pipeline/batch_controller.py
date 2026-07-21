#!/usr/bin/env python3
"""
AI生意经 - 智能批次控制器
===========================
功能：自动循环触发 GitHub Actions 批次，每批完成后：
  1. 读取云端执行日志，验证 DeepSeek 调用效果
  2. 记录进度到本地监控日志
  3. 触发下一批
  4. 如遇失败自动重试（最多3次）
"""

import subprocess, json, time, datetime, os, sys, re
from pathlib import Path

# ===== CONFIG =====
REPO_DIR       = Path(__file__).parent.parent
MONITOR_LOG    = REPO_DIR / "pipeline" / "data" / "batch_monitor.json"
BATCH_SIZE     = 100
INTER_BATCH_DELAY = 20   # seconds between batches
MAX_RETRIES    = 3
TIMEOUT_MINS   = 15      # max minutes per batch before declaring timeout

def gh(args, capture=True, check=True):
    """Run a gh CLI command"""
    cmd = ["gh"] + args
    result = subprocess.run(cmd, capture_output=capture, text=True, cwd=str(REPO_DIR))
    if check and result.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {result.stderr}")
    return result.stdout.strip() if capture else None

def log(msg, level="INFO"):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    prefix = {"INFO": "ℹ️ ", "OK": "✅", "WARN": "⚠️ ", "ERR": "❌", "BATCH": "📦"}.get(level, "  ")
    print(f"[{ts}] {prefix} {msg}")

def load_monitor():
    if MONITOR_LOG.exists():
        with open(MONITOR_LOG) as f:
            return json.load(f)
    return {"batches": [], "total_processed": 0, "started_at": datetime.datetime.now().isoformat()}

def save_monitor(data):
    MONITOR_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(MONITOR_LOG, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_current_db_count():
    """Get current project count from local data file"""
    db_file = REPO_DIR / "data" / "projects_live.json"
    if db_file.exists():
        with open(db_file) as f:
            return len(json.load(f))
    return 0

def trigger_batch(batch_num, is_first=False):
    """Trigger a batch on GitHub Actions and return run_id"""
    rebuild = "true" if is_first else "false"
    log(f"触发批次 {batch_num}（每批{BATCH_SIZE}个）...", "BATCH")

    out = gh(["workflow", "run", "bulk_import.yml",
              "-f", f"batch_num={batch_num}",
              "-f", f"batch_size={BATCH_SIZE}",
              "-f", f"rebuild_index={rebuild}"])

    time.sleep(5)

    # Get the run ID of the latest run
    list_out = gh(["run", "list", "--workflow=bulk_import.yml", "--limit=1",
                   "--json", "databaseId,status,createdAt"])
    runs = json.loads(list_out)
    if not runs:
        raise RuntimeError("No runs found after trigger")

    run_id = runs[0]["databaseId"]
    log(f"Run ID: {run_id} | 状态: {runs[0]['status']}", "INFO")
    return run_id

def wait_for_run(run_id, batch_num):
    """Poll until run completes. Returns (success, stats_dict)"""
    start = time.time()
    timeout_secs = TIMEOUT_MINS * 60

    log(f"等待批次 {batch_num} 在云端执行完成（最长 {TIMEOUT_MINS} 分钟）...")

    while True:
        elapsed = time.time() - start
        if elapsed > timeout_secs:
            log(f"批次 {batch_num} 超时（>{TIMEOUT_MINS}分钟）！", "ERR")
            return False, {}

        time.sleep(15)  # poll every 15s

        info_raw = gh(["run", "view", str(run_id), "--json",
                        "status,conclusion,jobs"])
        info = json.loads(info_raw)
        status = info.get("status", "")
        conclusion = info.get("conclusion", "")

        elapsed_min = int(elapsed // 60)
        elapsed_sec = int(elapsed % 60)
        log(f"批次 {batch_num} — 状态: {status}/{conclusion} | 已用: {elapsed_min}m{elapsed_sec}s")

        if status == "completed":
            if conclusion == "success":
                log(f"批次 {batch_num} 执行成功！", "OK")
                return True, extract_stats(run_id, batch_num)
            else:
                log(f"批次 {batch_num} 失败，结论: {conclusion}", "ERR")
                return False, {}

def extract_stats(run_id, batch_num):
    """Extract execution stats from run logs"""
    try:
        logs_raw = gh(["run", "view", str(run_id), "--log"])

        # Parse key metrics from scraper output
        stats = {"batch_num": batch_num, "run_id": run_id,
                 "completed_at": datetime.datetime.now().isoformat()}

        m = re.search(r'本批处理:\s*(\d+)\s*个项目', logs_raw)
        stats["processed"] = int(m.group(1)) if m else 0

        m = re.search(r'AI成功:\s*(\d+)', logs_raw)
        stats["ai_success"] = int(m.group(1)) if m else 0

        m = re.search(r'兜底:\s*(\d+)', logs_raw)
        stats["ai_fallback"] = int(m.group(1)) if m else 0

        m = re.search(r'数据库总计:\s*(\d+)\s*个项目', logs_raw)
        stats["db_total"] = int(m.group(1)) if m else 0

        m = re.search(r'待处理剩余:\s*(\d+)\s*个', logs_raw)
        stats["remaining"] = int(m.group(1)) if m else -1

        m = re.search(r'约\s*(\d+)\s*批', logs_raw)
        stats["batches_remaining"] = int(m.group(1)) if m else -1

        return stats

    except Exception as e:
        log(f"解析日志失败: {e}", "WARN")
        return {"batch_num": batch_num, "run_id": run_id,
                "completed_at": datetime.datetime.now().isoformat()}

def sync_local_data():
    """Pull latest data from GitHub so local DB count is accurate"""
    try:
        subprocess.run(["git", "pull", "--rebase", "origin", "main"],
                       capture_output=True, cwd=str(REPO_DIR))
    except Exception:
        pass

def print_progress_bar(done, total, width=40):
    pct = done / total if total > 0 else 0
    filled = int(width * pct)
    bar = "█" * filled + "░" * (width - filled)
    print(f"  [{bar}] {done}/{total} ({pct*100:.1f}%)")

def run_controller(start_batch=1, max_batches=37):
    monitor = load_monitor()
    completed_batches = {b["batch_num"] for b in monitor["batches"] if b.get("success")}

    print("\n" + "="*65)
    print("  🚀 AI生意经 智能批次控制器 启动")
    print(f"  目标: {max_batches} 批 × {BATCH_SIZE} 个 = ~{max_batches * BATCH_SIZE} 个项目")
    print(f"  已完成批次: {sorted(completed_batches)}")
    print("="*65 + "\n")

    total_target = 3666  # from sitemap

    for batch_num in range(start_batch, max_batches + 1):
        if batch_num in completed_batches:
            log(f"批次 {batch_num} 已完成，跳过", "OK")
            continue

        log(f"\n{'─'*50}", "INFO")
        log(f"开始批次 {batch_num}/{max_batches}", "BATCH")

        # Retry loop
        success = False
        for attempt in range(1, MAX_RETRIES + 1):
            if attempt > 1:
                log(f"重试第 {attempt} 次...", "WARN")
                time.sleep(30)

            try:
                run_id = trigger_batch(batch_num, is_first=(batch_num == 1))
                success, stats = wait_for_run(run_id, batch_num)

                if success:
                    # Sync local data
                    sync_local_data()

                    # Perform Instant QC and Self-Healing Repair
                    try:
                        log("正在对本批次拉回的数据进行即时质检 (QC)...", "INFO")
                        import sys
                        sys.path.append(str(Path(__file__).parent))
                        import qc_repair
                        qc_repair.run_qc_repair()
                        
                        # If local repaired data generated, commit & push it
                        subprocess.run(["git", "add", "data/"], capture_output=True, cwd=str(REPO_DIR))
                        diff_check = subprocess.run(["git", "diff", "--staged", "--quiet"], cwd=str(REPO_DIR))
                        if diff_check.returncode != 0:
                            log("质检发现并成功原地修复了低质量数据，正在推送更新到 GitHub...", "OK")
                            subprocess.run(["git", "commit", "-m", f"🔧 自动质检自愈：批次 {batch_num} 项目质量重刷"], capture_output=True, cwd=str(REPO_DIR))
                            subprocess.run(["git", "pull", "--rebase", "origin", "main"], capture_output=True, cwd=str(REPO_DIR))
                            subprocess.run(["git", "push", "origin", "main"], capture_output=True, cwd=str(REPO_DIR))
                    except Exception as qce:
                        log(f"质检自愈过程发生偶发异常: {qce}", "WARN")

                    # Record
                    stats["success"] = True
                    stats["attempt"] = attempt
                    monitor["batches"].append(stats)
                    monitor["total_processed"] = stats.get("db_total", monitor["total_processed"])
                    save_monitor(monitor)

                    # Print progress
                    db_total = stats.get("db_total", 0)
                    remaining = stats.get("remaining", -1)
                    ai_success = stats.get("ai_success", 0)
                    ai_fallback = stats.get("ai_fallback", 0)
                    ai_rate = f"{ai_success}/{ai_success+ai_fallback}" if (ai_success+ai_fallback) > 0 else "N/A"

                    print(f"\n  ┌─────────────────────────────────────────────┐")
                    print(f"  │  批次 {batch_num:2d} 完成                              │")
                    print(f"  │  DeepSeek AI成功率: {ai_rate:>10}              │")
                    print(f"  │  数据库总量:  {db_total:>6} 个项目               │")
                    print(f"  │  剩余待处理:  {remaining:>6} 个项目               │")
                    print(f"  └─────────────────────────────────────────────┘")
                    print_progress_bar(db_total, total_target)

                    if remaining == 0:
                        print("\n" + "="*65)
                        print("  🎉🎉🎉 全量迁移完成！所有项目已导入！")
                        print("  🌐 网站: https://ai-shengyi-jing.pages.dev")
                        print("="*65)
                        return

                    break  # success, exit retry loop

            except Exception as e:
                log(f"批次 {batch_num} 出错: {e}", "ERR")
                if attempt == MAX_RETRIES:
                    log(f"批次 {batch_num} 已重试 {MAX_RETRIES} 次，记录失败并继续", "ERR")
                    monitor["batches"].append({"batch_num": batch_num, "success": False,
                                               "error": str(e), "attempt": attempt})
                    save_monitor(monitor)

        # Inter-batch delay
        if batch_num < max_batches:
            log(f"批次 {batch_num} 结束，{INTER_BATCH_DELAY}秒后触发下一批...\n")
            time.sleep(INTER_BATCH_DELAY)

    print("\n" + "="*65)
    print("  ✅ 控制器运行完毕")
    print(f"  📊 最终数据库: {get_current_db_count()} 个项目")
    print("="*65)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AI生意经 批次控制器")
    parser.add_argument("--start", type=int, default=1, help="从第几批开始（默认1）")
    parser.add_argument("--max-batches", type=int, default=37, help="最多运行到第几批（默认37）")
    args = parser.parse_args()

    run_controller(start_batch=args.start, max_batches=args.max_batches)
