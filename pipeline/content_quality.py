"""Shared content-quality rules for public project records."""

from __future__ import annotations

import re
from urllib.parse import urlparse


CHINESE_RE = re.compile(r"[\u4e00-\u9fff]")
DETAIL_FIELDS = (
    "summary",
    "insight",
    "businessModel",
    "chinaOpportunity",
    "productArch",
    "businessLoop",
)

NAME_OVERRIDES = {
    "2bf209bb0fe5": "远程清洁服务平台",
    "25d78022c146": "交互式电子书平台",
    "c626015c47f2": "会议转录总结工具",
    "955cdde21bbe": "烟囱服务公司",
    "3146ebb05109": "高端沙滩生活品牌",
    "95f4aee81140": "阿育吠陀护肤品牌",
    "82d507df8234": "智能房贷分析平台",
    "ccad6108771b": "苹果设备效率工具",
    "87f1496d1172": "协作项目管理工具",
    "5561fb0ec9eb": "重力毯生活品牌",
    "74573bdfacf4": "抹茶订阅电商品牌",
    "c742026f3b27": "智能搬家估价平台",
    "60a18a35ed13": "手机挂绳配件品牌",
    "89861e03be9b": "智能钱包配件品牌",
    "5d95fa3788eb": "公开创业软件矩阵",
    "d767b5914708": "可持续连体裤品牌",
    "f3a49af3d661": "烧烤设备电商平台",
    "9fc4386920bc": "可持续家具电商",
    "fd6f13e118dd": "宠物健康零食品牌",
    "862c36913968": "赤足鞋品牌",
    "7898f0b84a09": "高性能轮子品牌",
    "66b765143cc4": "解酒保健品品牌",
    "86c7759be8ee": "手作设计课程平台",
}


def contains_chinese(value: object) -> bool:
    return bool(CHINESE_RE.search(str(value or "")))


def derive_chinese_name(project: dict) -> str:
    """Derive a concise Chinese display name from curated project content."""
    override = NAME_OVERRIDES.get(str(project.get("id", "")))
    if override:
        return override

    for field in ("nameZh", "name"):
        value = str(project.get(field, "")).strip()
        if contains_chinese(value):
            return value[:24]

    summary = re.sub(r"\s+", " ", str(project.get("summary", "")).strip())
    if contains_chinese(summary):
        candidate = re.split(r"[，。；：,;:]", summary, maxsplit=1)[0].strip()
        candidate = re.split(r"(?:通过|依靠|靠)", candidate, maxsplit=1)[0].strip()
        if candidate and contains_chinese(candidate):
            return candidate[:24]

    niche = str(project.get("niche", "")).strip()
    if contains_chinese(niche):
        return f"海外{niche}项目"[:24]
    return "海外创业项目"


def is_placeholder(project: dict) -> bool:
    """Identify listing/category rows that are not actual project case studies."""
    path = urlparse(str(project.get("url", ""))).path.rstrip("/")
    name = str(project.get("name", "")).strip()
    lacks_analysis = not any(project.get(field) for field in DETAIL_FIELDS)
    return path == "/data" or (name.endswith("...") and lacks_analysis)


def project_content_errors(project: dict) -> list[str]:
    errors: list[str] = []
    if is_placeholder(project):
        errors.append("is a listing placeholder, not a project detail page")

    if not contains_chinese(project.get("nameZh")):
        errors.append("nameZh must contain a Chinese project name")

    for field in DETAIL_FIELDS:
        if not str(project.get(field, "")).strip():
            errors.append(f"is missing detailed field: {field}")

    steps = project.get("getStartedPath")
    if not isinstance(steps, list) or len([step for step in steps if step]) < 3:
        errors.append("getStartedPath must contain at least 3 steps")

    return errors
