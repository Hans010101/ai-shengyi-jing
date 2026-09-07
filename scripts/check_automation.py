#!/usr/bin/env python3
"""Verify published data and recover stalled GitHub collection/deployment runs."""

import argparse
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.build_site import build_project_index

SITES = (
    "https://aishengyijing.asia",
    "https://ai-shengyi-jing.pages.dev",
    "https://ai-shengyi-jing-cn-vfh61o1a.edgeone.dev",
)
ISSUE_TITLE = "[自动巡检] 案例更新需要处理"
WORKFLOWS = ("daily_scrape.yml", "deploy_cloudflare.yml")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def gh(*args):
    result = subprocess.check_output(["gh", *args], text=True)
    return json.loads(result) if result.strip() else None


def remote_json(url):
    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "AIShengyiJing-Health/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def verify_site(site, projects, commit=None):
    """Check actual public records and newest bilingual detail, not just HTTP 200."""
    if commit and remote_json(site + "/deployment.json").get("commit") != commit:
        raise ValueError("deployed commit does not match the built artifact")
    if remote_json(site + "/data/projects_index.json") != build_project_index(projects):
        raise ValueError("published project index differs from the GitHub data")
    if projects:
        project_id = str(projects[0]["id"])
        expected = read_json(ROOT / "data" / "case_articles" / f"{project_id}.json")
        if remote_json(site + f"/data/case_articles/{project_id}.json") != expected:
            raise ValueError("newest bilingual case detail differs from the GitHub data")


def verify_sites(commit=None, attempts=3):
    projects = read_json(ROOT / "data" / "projects_live.json")

    def check(site):
        for attempt in range(attempts):
            try:
                verify_site(site, projects, commit)
                print(f"Verified {site}: {len(projects)} projects + newest detail")
                return None
            except (OSError, ValueError) as error:
                if attempt + 1 == attempts:
                    return f"{site}: {error}"
                time.sleep(20)

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        return [error for error in pool.map(check, SITES) if error]


def recovery_action(runs, now=None):
    """Bound retries to three attempts; don't restart active or superseded runs."""
    runs = [run for run in runs if run.get("conclusion") != "skipped"]
    if not runs:
        return "dispatch", None
    latest = runs[0]
    if latest["status"] != "completed":
        if now and hours_since(latest["created_at"], now) > 2:
            return "alert", latest
        return "wait", latest
    if latest["conclusion"] in {"failure", "timed_out"}:
        return ("retry" if latest.get("run_attempt", 1) < 3 else "alert"), latest
    if latest["conclusion"] != "success":
        return "alert", latest  # Do not undo an intentional cancellation.
    return "ok", latest


def hours_since(value, now):
    return (now - dt.datetime.fromisoformat(value.replace("Z", "+00:00"))).total_seconds() / 3600


def watchdog(repair=False):
    repo = os.environ["GITHUB_REPOSITORY"]
    now = dt.datetime.now(dt.timezone.utc)
    errors = []
    recovering = False
    latest_runs = {}
    for workflow in WORKFLOWS:
        runs = gh("api", f"repos/{repo}/actions/workflows/{workflow}/runs?branch=main&per_page=10")["workflow_runs"]
        action, latest = recovery_action(runs, now)
        latest_runs[workflow] = latest
        print(f"{workflow}: {action}")
        if action in {"retry", "dispatch", "wait"}:
            recovering = True
            if repair and action == "retry":
                gh("api", "--method", "POST", f"repos/{repo}/actions/runs/{latest['id']}/rerun")
            elif repair and action == "dispatch":
                gh("workflow", "run", workflow, "--ref", "main")
        elif action == "alert":
            errors.append(f"{workflow} 自动恢复未成功：{latest['html_url']}")

    health = read_json(ROOT / "pipeline" / "data" / "scrape_health.json")
    if hours_since(health.get("completedAt", health["checkedAt"]), now) > 26:
        errors.append("超过 26 小时没有完成采集检查（不以新增数量判断故障）。")
        latest = latest_runs[WORKFLOWS[0]]
        if latest and latest["conclusion"] == "success" and hours_since(latest["created_at"], now) > 2:
            if repair:
                gh("workflow", "run", WORKFLOWS[0], "--ref", "main")
            recovering = True
    if health.get("status") != "healthy" or health.get("pendingProjects", 0):
        errors.append("采集来源降级或存在待重试项目；详见 pipeline/data/scrape_health.json。")
        latest = latest_runs[WORKFLOWS[0]]
        if not recovering and latest and latest["conclusion"] == "success" and latest.get("run_attempt", 1) < 3:
            if repair:
                gh("api", "--method", "POST", f"repos/{repo}/actions/runs/{latest['id']}/rerun")
            recovering = True

    # A deployment in flight is expected to lag current main; check after completion.
    if not recovering:
        live_errors = verify_sites()
        errors.extend(live_errors)
        latest = latest_runs[WORKFLOWS[1]]
        if live_errors and latest and latest["conclusion"] == "success" and latest.get("run_attempt", 1) < 3:
            if repair:
                gh("api", "--method", "POST", f"repos/{repo}/actions/runs/{latest['id']}/rerun")
            recovering = True

    print(json.dumps({"recovering": recovering, "errors": errors}, ensure_ascii=False))
    if not repair or recovering:
        return  # Recovery outcome will trigger a fresh check; no premature alerts.
    issues = gh("api", f"repos/{repo}/issues?state=open&per_page=100")
    issue = next((item for item in issues if item["title"] == ISSUE_TITLE and item.get("user", {}).get("login") == "github-actions[bot]"), None)
    if errors and not issue:
        gh("api", "--method", "POST", f"repos/{repo}/issues", "-f", f"title={ISSUE_TITLE}",
           "-f", "body=自动巡检发现持续异常：\n\n" + "\n".join(f"- {e}" for e in errors))
    elif not errors and issue:
        gh("api", "--method", "PATCH", f"repos/{repo}/issues/{issue['number']}", "-f", "state=closed")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-deployment", action="store_true")
    parser.add_argument("--repair", action="store_true", help="Allow bounded GitHub recovery and deduplicated alerts")
    args = parser.parse_args()
    if args.verify_deployment:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        errors = verify_sites(commit)
        if errors:
            raise SystemExit("\n".join(errors))
    else:
        watchdog(args.repair)
