# -*- coding: utf-8 -*-
"""
PhD_AdvisorContact_System — Local Academic Outreach & Lightweight Mail Workbench
- Runs strictly locally on 127.0.0.1; all credentials, email threads, resumes, and Excel workbooks stay on disk.
- Bidirectional sync with local Excel workbook (preserving styling, hyperlinks, and data validations).
- Features: Single & batched anti-spam SMTP send, whitelisted IMAP reply sync + popup alerts, and DeepSeek BYOK AI copilot.
"""

import base64
import datetime
import email
import email.header
import email.utils
import hashlib
import imaplib
import json
import mimetypes
import os
import random
import re
import shutil
import smtplib
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from email.header import Header
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import openpyxl

IS_FROZEN = bool(getattr(sys, "frozen", False))
BASE_DIR = Path(sys.executable).resolve().parent if IS_FROZEN else Path(__file__).resolve().parent
INSTANCE_ID = hashlib.sha256(str(BASE_DIR.resolve()).lower().encode("utf-8")).hexdigest()[:16]
BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", BASE_DIR))
WORKSPACE_ROOT = BASE_DIR.parent.resolve()
STATIC_DIR = (BASE_DIR / "static") if (BASE_DIR / "static").is_dir() else (BUNDLE_DIR / "static")
CONFIG_PATH = BASE_DIR / "config.json"
CONFIG_EXAMPLE_PATH = (
    (BASE_DIR / "config.example.json")
    if (BASE_DIR / "config.example.json").is_file()
    else (BUNDLE_DIR / "config.example.json")
)
LOGS_DIR = BASE_DIR / "logs"
HISTORY_PATH = LOGS_DIR / "send_history.jsonl"
THREADS_PATH = LOGS_DIR / "mail_threads.json"

LOGS_DIR.mkdir(parents=True, exist_ok=True)

EXCEL_LOCK = threading.Lock()
JOB_LOCK = threading.RLock()
THREADS_LOCK = threading.RLock()
IMAP_SYNC_LOCK = threading.Lock()

# Excel columns (1-based indices, Header on Row 4, Data from Row 5)
COL_SEQ = 1
COL_PRIORITY = 2
COL_NAME = 3
COL_DEPT = 4
COL_TITLE = 5
COL_TAGS = 6
COL_RESEARCH = 7
COL_EMAIL = 8
COL_NOTE = 9
COL_IN_BATCH = 10
COL_SENDER = 11
COL_STATUS = 12
COL_HOOK = 13
COL_SUBJECT = 14
COL_BODY_PATH = 15
COL_RESUME_PATH = 16
COL_SENT_TIME = 17
COL_REPLY_NOTE = 18

DATA_START_ROW = 5
DASHBOARD_SHEET = "总览与导航"

ACTIVE_JOB = {
    "running": False,
    "stop_requested": False,
    "mode": "",
    "started_at": "",
    "finished_at": "",
    "scheduled_start_at": "",
    "schedule_wait_seconds": 0,
    "total": 0,
    "completed": 0,
    "succeeded": 0,
    "failed": 0,
    "current_item": None,
    "waiting_seconds": 0,
    "next_item": None,
    "items": [],
    "logs": [],
}


def now_str():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def now_short():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M")


def today_str():
    return datetime.date.today().strftime("%Y-%m-%d")


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|\s]+', "_", str(name or "")).strip("_")


def build_blank_config() -> dict:
    return {
        "excel_path": "博导信息与套磁管理表.xlsx",
        "default_resume_path": "",
        "outbox_dir": "outbox",
        "sender_profile": {
            "name": "",
            "affiliation": "",
            "degree_info": "",
            "research_summary": "",
            "phone": "",
            "wechat": "",
            "github": "",
        },
        "ai_config": {
            "provider": "deepseek",
            "base_url": "https://api.deepseek.com",
            "model": "deepseek-chat",
            "api_key": "",
        },
        "policy": {
            "min_delay_sec": 180,
            "max_delay_sec": 420,
            "avoid_consecutive_same_domain": True,
            "max_attachment_mb": 2.5,
        },
        "accounts": [
            {
                "id": "学校邮箱",
                "label": "学校邮箱（推荐主力）",
                "email": "",
                "display_name": "",
                "smtp_host": "",
                "smtp_port": 465,
                "smtp_security": "SSL",
                "imap_host": "",
                "imap_port": 993,
                "drafts_folder": "Drafts",
                "password": "",
                "daily_limit": 5,
                "enabled": True,
                "note": "高校 .edu.cn 网关互信度高，请在所在大学邮箱网页端查看 SMTP/IMAP 服务器及客户端密码设置",
            },
            {
                "id": "163邮箱-1",
                "label": "163 邮箱",
                "email": "",
                "display_name": "",
                "smtp_host": "smtp.163.com",
                "smtp_port": 465,
                "smtp_security": "SSL",
                "imap_host": "imap.163.com",
                "imap_port": 993,
                "drafts_folder": "Drafts",
                "password": "",
                "daily_limit": 5,
                "enabled": False,
                "note": "需在 163 网页端【设置 -> POP3/SMTP/IMAP】开启服务并生成客户端授权码（非登录密码）",
            },
        ],
    }


def resolve_app_path(raw: str) -> Path:
    if not raw:
        return Path("")
    p = Path(raw)
    return p if p.is_absolute() else (BASE_DIR / p).resolve()


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        if CONFIG_EXAMPLE_PATH.exists():
            shutil.copy2(CONFIG_EXAMPLE_PATH, CONFIG_PATH)
        else:
            save_config(build_blank_config())
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    sp = cfg.setdefault("sender_profile", {})
    sp.setdefault("research_summary", "")
    ai = cfg.setdefault("ai_config", {})
    ai.setdefault("provider", "deepseek")
    ai.setdefault("base_url", "https://api.deepseek.com")
    ai.setdefault("model", "deepseek-chat")
    ai.setdefault("api_key", "")
    return cfg


def save_config(cfg: dict) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def is_safe_path(p: Path, cfg: dict = None) -> bool:
    try:
        rp = p.resolve()
        if rp == BASE_DIR or BASE_DIR in rp.parents:
            return True
        if rp == WORKSPACE_ROOT or WORKSPACE_ROOT in rp.parents:
            return True
        if cfg:
            outbox_p = resolve_app_path(cfg.get("outbox_dir") or "outbox")
            if outbox_p and (rp == outbox_p or outbox_p in rp.parents):
                return True
            def_res = resolve_app_path(cfg.get("default_resume_path", ""))
            if def_res and str(def_res) and rp == def_res:
                return True
        return False
    except Exception:
        return False


def resolve_user_path(raw: str, cfg: dict) -> Path:
    if not raw:
        return Path("")
    p = Path(raw)
    if p.is_absolute():
        return p
    outbox_p = resolve_app_path(cfg.get("outbox_dir") or "outbox")
    for base in (BASE_DIR, WORKSPACE_ROOT, outbox_p):
        cand = (base / p).resolve()
        if cand.exists():
            return cand
    return (BASE_DIR / p).resolve()


def get_task_dir(cfg: dict, school: str, name: str) -> Path:
    outbox = resolve_app_path(cfg.get("outbox_dir") or "outbox")
    d = outbox / f"{sanitize_filename(school)}_{sanitize_filename(name)}"
    return d


def read_history() -> list:
    if not HISTORY_PATH.exists():
        return []
    items = []
    with open(HISTORY_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except Exception:
                pass
    return items


def append_history(entry: dict) -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _format_elapsed_cn(seconds: int) -> str:
    sec = max(0, int(seconds))
    days, rem = divmod(sec, 86400)
    hours, rem = divmod(rem, 3600)
    mins, secs = divmod(rem, 60)
    if days > 0:
        return f"{days}天{hours}小时{mins}分钟"
    if hours > 0:
        return f"{hours}小时{mins}分钟"
    if mins > 0:
        return f"{mins}分钟"
    return f"{secs}秒"


def _parse_start_dt(raw: str):
    s = (raw or "").strip()
    if not s:
        return None
    s = s.replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.datetime.strptime(s, fmt)
        except ValueError:
            pass
    raise ValueError(f"无效的定时发送时间格式：{raw}")


def get_quota_today(cfg: dict = None, target_date: str = None) -> dict:
    if cfg is None:
        try:
            cfg = load_config()
        except Exception:
            cfg = {}
    day = target_date or today_str()
    reset_after = (cfg or {}).get("quota_reset_after", "") if day == today_str() else ""
    counts = {}
    for h in read_history():
        if h.get("date") == day and h.get("mode") == "send" and h.get("ok"):
            if reset_after and (h.get("timestamp") or "") <= reset_after:
                continue
            acc = h.get("account_id", "")
            counts[acc] = counts.get(acc, 0) + 1
    return counts


def get_last_send_batch_summary() -> dict:
    """Summarizes the most recent SMTP send burst and elapsed time since the last successful send."""
    sent = [h for h in read_history() if h.get("mode") == "send" and h.get("ok") and h.get("timestamp")]
    if not sent:
        return {
            "has_history": False,
            "last_sent_at": "",
            "last_batch_start": "",
            "last_batch_end": "",
            "last_batch_count": 0,
            "elapsed_seconds": None,
            "elapsed_text": "暂无历史发送记录",
        }
    parsed = []
    for h in sent:
        try:
            dt = datetime.datetime.strptime(h["timestamp"], "%Y-%m-%d %H:%M:%S")
            parsed.append((dt, h))
        except Exception:
            pass
    if not parsed:
        return {"has_history": False, "last_sent_at": "", "last_batch_start": "", "last_batch_end": "", "last_batch_count": 0, "elapsed_seconds": None, "elapsed_text": "暂无历史发送记录"}
    parsed.sort(key=lambda x: x[0])
    last_dt, last_item = parsed[-1]
    batch_start_dt = last_dt
    batch_count = 1
    prev_dt = last_dt
    for dt, _ in reversed(parsed[:-1]):
        if (prev_dt - dt).total_seconds() <= 7200:
            batch_start_dt = dt
            batch_count += 1
            prev_dt = dt
        else:
            break
    elapsed = max(0, int((datetime.datetime.now() - last_dt).total_seconds()))
    return {
        "has_history": True,
        "last_sent_at": last_item["timestamp"],
        "last_batch_start": batch_start_dt.strftime("%Y-%m-%d %H:%M"),
        "last_batch_end": last_dt.strftime("%Y-%m-%d %H:%M"),
        "last_batch_count": batch_count,
        "elapsed_seconds": elapsed,
        "elapsed_text": _format_elapsed_cn(elapsed),
    }


def get_draft_count_today() -> dict:
    today = today_str()
    counts = {}
    for h in read_history():
        if h.get("date") == today and h.get("mode") == "draft" and h.get("ok"):
            acc = h.get("account_id", "")
            counts[acc] = counts.get(acc, 0) + 1
    return counts


def cell_str(val) -> str:
    if val is None:
        return ""
    return str(val).strip()


def create_starter_excel(target_path: Path) -> None:
    """Creates a clean commercial starter workbook matching the 18-column workbench schema."""
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation

    wb = openpyxl.Workbook()
    ws_sum = wb.active
    ws_sum.title = DASHBOARD_SHEET
    ws_sum["A1"] = "博士申请 · 多校博导信息与套磁管理总览"
    ws_sum["A1"].font = Font(name="Microsoft YaHei", size=14, bold=True, color="1F3B34")
    ws_sum["A3"] = "使用说明：在右侧各高校分页的「第 5 行」起维护导师信息，工作台将自动读取并双向同步投递状态。"

    ws = wb.create_sheet("示例高校")
    ws["A1"] = "示例高校 · 博士生导师候选与套磁管理清单（可将本分页重命名为您报考的高校）"
    ws["A1"].font = Font(name="Microsoft YaHei", size=12, bold=True, color="1F3B34")
    ws["A3"] = "一、导师基础信息与科研方向匹配"
    ws["J3"] = "二、投递决策与状态"
    ws["M3"] = "三、套磁定制与邮件系统联动字段"

    headers = [
        "序号", "匹配度", "导师姓名\n(点击直达官网)", "学院/单位", "职称与博导资格",
        "匹配方向标签", "详细研究方向与代表亮点", "公开邮箱", "个人备注 / 来源",
        "是否纳入\n本批", "分配发件箱", "沟通状态", "研究契合笔记",
        "邮件主题", "正文文件路径", "专属简历路径", "发送时间", "回信与跟进记录",
    ]
    header_fill = PatternFill("solid", fgColor="F3F4F6")
    header_font = Font(name="Microsoft YaHei", size=10, bold=True, color="18181B")
    for idx, text in enumerate(headers, start=1):
        cell = ws.cell(4, idx, text)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    sample_row = [
        1, "极高匹配", "张示例（演示）", "文学院 / 社会学院", "教授 / 博导",
        "现代文学 | 文化研究", "主要研究现当代文学思潮、媒介文化与跨学科文本分析",
        "example@university.edu.cn", "示例数据：可直接在网页中修改或点击右上角档案删除",
        "是", "自动分配", "待撰写", "结合个人硕士论文选题与导师近期专著做针对性阐述",
        "", "", "", "", "",
    ]
    for idx, val in enumerate(sample_row, start=1):
        ws.cell(5, idx, val)

    widths = [7, 16, 18, 22, 18, 22, 36, 26, 24, 12, 14, 16, 28, 28, 24, 24, 18, 24]
    for idx, w in enumerate(widths, start=1):
        col_letter = openpyxl.utils.get_column_letter(idx)
        ws.column_dimensions[col_letter].width = w

    dv_prio = DataValidation(type="list", formula1='"极高匹配,高度匹配,可以尝试,待进一步了解"', allow_blank=True)
    dv_batch = DataValidation(type="list", formula1='"是,否"', allow_blank=True)
    dv_status = DataValidation(
        type="list",
        formula1='"待撰写,待发送,已发送,已回信,暂缓"',
        allow_blank=True,
    )
    ws.add_data_validation(dv_prio)
    ws.add_data_validation(dv_batch)
    ws.add_data_validation(dv_status)
    dv_prio.add("B5:B200")
    dv_batch.add("J5:J200")
    dv_status.add("L5:L200")

    target_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(target_path)
    wb.close()


def load_professors(cfg: dict) -> list:
    excel_path = resolve_app_path(cfg.get("excel_path") or "博导信息与套磁管理表.xlsx")
    if not excel_path.exists():
        create_starter_excel(excel_path)

    default_resume = resolve_app_path(cfg.get("default_resume_path", ""))
    default_resume_exists = bool(str(default_resume)) and default_resume.is_file()
    default_resume_mb = round(default_resume.stat().st_size / (1024 * 1024), 2) if default_resume_exists else 0.0

    results = []
    with EXCEL_LOCK:
        wb = openpyxl.load_workbook(excel_path, data_only=False)
        for sname in wb.sheetnames:
            if sname == DASHBOARD_SHEET:
                continue
            ws = wb[sname]
            for r in range(DATA_START_ROW, ws.max_row + 1):
                name_cell = ws.cell(r, COL_NAME)
                name = cell_str(name_cell.value)
                if not name:
                    continue
                homepage = ""
                if name_cell.hyperlink and name_cell.hyperlink.target:
                    homepage = str(name_cell.hyperlink.target)

                body_path_raw = cell_str(ws.cell(r, COL_BODY_PATH).value)
                resume_path_raw = cell_str(ws.cell(r, COL_RESUME_PATH).value)

                task_dir = get_task_dir(cfg, sname, name)
                auto_body = task_dir / "email.txt"
                auto_meta = task_dir / "meta.json"
                auto_resume = task_dir / "resume.pdf"

                # Resolve body path
                effective_body_path = resolve_user_path(body_path_raw, cfg) if body_path_raw else auto_body
                body_exists = effective_body_path.is_file() if str(effective_body_path) else False

                # Check local meta fallback (in case Excel was locked earlier)
                meta_subject = ""
                if auto_meta.is_file():
                    try:
                        m = json.loads(auto_meta.read_text(encoding="utf-8"))
                        meta_subject = m.get("subject", "")
                    except Exception:
                        pass

                subject = cell_str(ws.cell(r, COL_SUBJECT).value) or meta_subject

                # Resolve resume path
                is_custom_resume = False
                if resume_path_raw:
                    eff_res = resolve_user_path(resume_path_raw, cfg)
                    is_custom_resume = True
                elif auto_resume.is_file():
                    eff_res = auto_resume
                    is_custom_resume = True
                else:
                    eff_res = default_resume

                res_exists = eff_res.is_file() if str(eff_res) else False
                res_mb = round(eff_res.stat().st_size / (1024 * 1024), 2) if res_exists else 0.0
                if not is_custom_resume and default_resume_exists:
                    res_mb = default_resume_mb

                results.append({
                    "id": f"{sname}::{r}",
                    "sheet": sname,
                    "row": r,
                    "seq": ws.cell(r, COL_SEQ).value or (r - DATA_START_ROW + 1),
                    "priority": cell_str(ws.cell(r, COL_PRIORITY).value) or "P2-备选/拓展",
                    "name": name,
                    "homepage": homepage,
                    "dept": cell_str(ws.cell(r, COL_DEPT).value),
                    "title": cell_str(ws.cell(r, COL_TITLE).value),
                    "tags": cell_str(ws.cell(r, COL_TAGS).value),
                    "research": cell_str(ws.cell(r, COL_RESEARCH).value),
                    "email": cell_str(ws.cell(r, COL_EMAIL).value),
                    "note": cell_str(ws.cell(r, COL_NOTE).value),
                    "in_batch": cell_str(ws.cell(r, COL_IN_BATCH).value) or "否",
                    "assigned_sender": cell_str(ws.cell(r, COL_SENDER).value) or "自动分配",
                    "status": cell_str(ws.cell(r, COL_STATUS).value) or "未开始",
                    "hook": cell_str(ws.cell(r, COL_HOOK).value),
                    "subject": subject,
                    "body_path": body_path_raw or (str(effective_body_path) if body_exists else ""),
                    "body_exists": body_exists,
                    "resume_path": resume_path_raw,
                    "effective_resume_path": str(eff_res) if str(eff_res) else "",
                    "resume_name": eff_res.name if str(eff_res) else "",
                    "resume_exists": res_exists,
                    "resume_size_mb": res_mb,
                    "is_custom_resume": is_custom_resume,
                    "sent_time": cell_str(ws.cell(r, COL_SENT_TIME).value),
                    "reply_note": cell_str(ws.cell(r, COL_REPLY_NOTE).value),
                })
        wb.close()
    return results


def update_excel_row(cfg: dict, sheet: str, row: int, updates: dict) -> tuple:
    """Safely updates specific cells in the Excel workbook while preserving styles/hyperlinks/formulas."""
    excel_path = resolve_app_path(cfg.get("excel_path") or "博导信息与套磁管理表.xlsx")
    col_map = {
        "priority": COL_PRIORITY,
        "email": COL_EMAIL,
        "note": COL_NOTE,
        "in_batch": COL_IN_BATCH,
        "assigned_sender": COL_SENDER,
        "status": COL_STATUS,
        "hook": COL_HOOK,
        "subject": COL_SUBJECT,
        "body_path": COL_BODY_PATH,
        "resume_path": COL_RESUME_PATH,
        "sent_time": COL_SENT_TIME,
        "reply_note": COL_REPLY_NOTE,
    }
    with EXCEL_LOCK:
        try:
            wb = openpyxl.load_workbook(excel_path)
            if sheet not in wb.sheetnames:
                wb.close()
                return False, f"工作表 {sheet} 不存在"
            ws = wb[sheet]
            for key, val in updates.items():
                if key in col_map and val is not None:
                    ws.cell(row, col_map[key]).value = val
            wb.save(excel_path)
            wb.close()
            return True, ""
        except PermissionError:
            return False, "Excel 文件当前正被 WPS / Microsoft Excel 打开占用，无法回写；本地正文已保存，请关闭 Excel 后再点击保存同步。"
        except Exception as e:
            return False, f"写入 Excel 失败：{e}"


def load_professor_body(cfg: dict, prof: dict) -> str:
    body_path_raw = prof.get("body_path", "")
    task_dir = get_task_dir(cfg, prof["sheet"], prof["name"])
    candidates = []
    if body_path_raw:
        candidates.append(resolve_user_path(body_path_raw, cfg))
    candidates.append(task_dir / "email.txt")
    for p in candidates:
        if p and p.is_file():
            return p.read_text(encoding="utf-8")
    return ""


def generate_smart_draft(cfg: dict, prof: dict) -> dict:
    """Creates a clean, generic, zero-hardcoded academic draft using sender_profile & professor fields."""
    sp = cfg.get("sender_profile", {})
    my_name = (sp.get("name") or "").strip() or "【您的姓名】"
    my_school = (sp.get("affiliation") or "").strip() or "【您的在读/毕业院校】"
    my_degree = (sp.get("degree_info") or "").strip() or "【年级与专业，如：2024级硕士研究生】"
    research_summary = (sp.get("research_summary") or "").strip()
    phone = (sp.get("phone") or "").strip()
    wechat = (sp.get("wechat") or "").strip()
    github = (sp.get("github") or "").strip()

    prof_name = prof.get("name", "")
    school = prof.get("sheet", "贵校")
    research = prof.get("research", "")
    hook = (prof.get("hook") or "").strip().rstrip("。，、.;；!！ ")
    research_clean = re.sub(r"[（(][^）)]*[）)]", "", research).strip().rstrip("，、,;； ") or "相关前沿方向"

    subject = f"【博士申请自荐】— {my_name}（{my_school}）"

    work_para = (
        research_summary
        if research_summary
        else "【建议在右上角「设置 → 个人名片」中补充您的科研成果与代表作概述，或点击右上角「AI 助手」自动润色生成】研究生阶段我围绕本领域核心问题完成了系统的科研训练，具备独立的文献梳理、实验设计与学术写作能力。"
    )

    hook_para = (
        f"了解到您课题组长期聚焦于{research_clean}，{hook}，希望博士阶段能有机会在您的指导下继续深入研究。"
        if hook
        else f"此前在{school}官网了解到您课题组主要聚焦于{research_clean}，与我目前积累的研究兴趣与方法训练较为契合，希望博士阶段能沿着您的方向继续做深。"
    )

    contact_lines = [my_name, f"{my_school} · {my_degree}"]
    c_parts = []
    if phone:
        c_parts.append(f"手机：{phone}")
    if wechat:
        c_parts.append(f"微信：{wechat}")
    if c_parts:
        contact_lines.append(" | ".join(c_parts))
    if github:
        contact_lines.append(f"个人主页/GitHub：{github}")
    signature = "\n".join(contact_lines)

    body = f"""尊敬的{prof_name}老师：

您好！冒昧给您写信。我是{my_school}{my_degree}{my_name}。此前在{school}主页了解到您课题组的研究布局，特此来信咨询您是否有博士研究生的招生计划。

在过往科研学习中，我的研究与实践重点如下：
{work_para}

{hook_para}

随信附上个人简历，烦请您在方便时查阅。若您觉得我的研究背景与课题组需求有结合的可能，非常希望能有机会向您简要汇报近期工作，并听取您对博士阶段研究的建议。感谢您拨冗阅读，期待您的回复！

此致
敬礼！

{signature}
"""
    return {"subject": subject, "body": body}


def _configure_school_sheet(ws, school_name: str) -> None:
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation

    ws["A1"] = f"{school_name} · 博士生导师候选与套磁管理清单"
    ws["A1"].font = Font(name="Microsoft YaHei", size=12, bold=True, color="1F3B34")
    ws["A3"] = "一、导师基础信息与科研方向匹配"
    ws["J3"] = "二、投递决策与状态"
    ws["M3"] = "三、套磁定制与邮件系统联动字段"

    headers = [
        "序号", "优先级", "导师姓名\n(点击直达官网)", "学院/单位", "职称与博导资格",
        "匹配方向标签", "详细研究方向与代表亮点", "公开邮箱", "个人备注 / 来源",
        "是否纳入\n本批", "分配发件箱", "投递状态", "定制切入点（套磁钩子）",
        "邮件主题", "正文文件路径", "专属简历路径", "发送时间", "回复摘要与跟进记录",
    ]
    header_fill = PatternFill("solid", fgColor="EFECE5")
    header_font = Font(name="Microsoft YaHei", size=10, bold=True, color="1C1917")
    for idx, text in enumerate(headers, start=1):
        cell = ws.cell(4, idx, text)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    widths = [7, 16, 18, 22, 18, 22, 36, 26, 24, 12, 14, 16, 28, 28, 24, 24, 18, 24]
    for idx, w in enumerate(widths, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(idx)].width = w

    dv_prio = DataValidation(type="list", formula1='"P0-冲刺强匹配,P1-重点推荐,P2-备选/拓展,待核实博导"', allow_blank=True)
    dv_batch = DataValidation(type="list", formula1='"是,否"', allow_blank=True)
    dv_status = DataValidation(
        type="list",
        formula1='"未开始,待准备材料,待审核,已确认待发,已写入草稿,已发送,已回复-积极,已回复-无名额,暂缓"',
        allow_blank=True,
    )
    ws.add_data_validation(dv_prio)
    ws.add_data_validation(dv_batch)
    ws.add_data_validation(dv_status)
    dv_prio.add("B5:B200")
    dv_batch.add("J5:J200")
    dv_status.add("L5:L200")


def append_professors_to_excel(cfg: dict, school: str, items: list) -> dict:
    excel_path = resolve_app_path(cfg.get("excel_path") or "博导信息与套磁管理表.xlsx")
    if not excel_path.exists():
        create_starter_excel(excel_path)

    school_clean = (school or "").strip() or "新增高校"
    with EXCEL_LOCK:
        try:
            wb = openpyxl.load_workbook(excel_path)
            if school_clean in wb.sheetnames:
                ws = wb[school_clean]
            else:
                ws = wb.create_sheet(school_clean)
                _configure_school_sheet(ws, school_clean)

            existing_names = set()
            existing_emails = set()
            last_row = DATA_START_ROW - 1
            for r in range(DATA_START_ROW, ws.max_row + 1):
                nm = cell_str(ws.cell(r, COL_NAME).value)
                em = cell_str(ws.cell(r, COL_EMAIL).value).lower()
                if nm:
                    existing_names.add(nm)
                    last_row = r
                if em:
                    existing_emails.add(em)

            added = 0
            skipped = 0
            next_seq = (last_row - DATA_START_ROW + 1) + 1
            for item in items:
                name = (item.get("name") or "").strip()
                if not name:
                    continue
                email_addr = (item.get("email") or "").strip()
                if name in existing_names or (email_addr and email_addr.lower() in existing_emails):
                    skipped += 1
                    continue

                row_idx = last_row + 1
                last_row = row_idx
                ws.cell(row_idx, COL_SEQ, next_seq)
                next_seq += 1
                ws.cell(row_idx, COL_PRIORITY, item.get("priority") or "高度匹配")
                name_cell = ws.cell(row_idx, COL_NAME, name)
                hp = (item.get("homepage") or "").strip()
                if hp.startswith("http"):
                    name_cell.hyperlink = hp
                ws.cell(row_idx, COL_DEPT, (item.get("dept") or "").strip())
                ws.cell(row_idx, COL_TITLE, (item.get("title") or "").strip())
                ws.cell(row_idx, COL_TAGS, (item.get("tags") or "").strip())
                ws.cell(row_idx, COL_RESEARCH, (item.get("research") or "").strip())
                ws.cell(row_idx, COL_EMAIL, email_addr)
                ws.cell(row_idx, COL_NOTE, (item.get("note") or "").strip())
                ws.cell(row_idx, COL_IN_BATCH, "否" if item.get("in_batch") in (False, "否") else "是")
                ws.cell(row_idx, COL_SENDER, "自动分配")
                ws.cell(row_idx, COL_STATUS, item.get("status") or "待撰写")
                ws.cell(row_idx, COL_HOOK, (item.get("hook") or "").strip())

                existing_names.add(name)
                if email_addr:
                    existing_emails.add(email_addr.lower())
                added += 1

            wb.save(excel_path)
            wb.close()
            return {"ok": True, "added": added, "skipped": skipped, "sheet": school_clean}
        except PermissionError:
            return {"ok": False, "error": "Excel 文件正被 WPS / Microsoft Excel 占用，请关闭后再导入。"}
        except Exception as e:
            return {"ok": False, "error": f"写入 Excel 失败：{e}"}


def delete_professor_from_excel(cfg: dict, sheet: str, row: int) -> tuple:
    excel_path = resolve_app_path(cfg.get("excel_path") or "博导信息与套磁管理表.xlsx")
    if not excel_path.exists():
        return False, "未找到本地 Excel 文件"
    with EXCEL_LOCK:
        try:
            wb = openpyxl.load_workbook(excel_path)
            if sheet not in wb.sheetnames:
                wb.close()
                return False, f"未找到高校分页：{sheet}"
            ws = wb[sheet]
            if row < DATA_START_ROW or row > ws.max_row:
                wb.close()
                return False, "导师行号无效"
            ws.delete_rows(row, 1)
            # Re-number sequence column cleanly
            seq = 1
            for r in range(DATA_START_ROW, ws.max_row + 1):
                if cell_str(ws.cell(r, COL_NAME).value):
                    ws.cell(r, COL_SEQ, seq)
                    seq += 1
            wb.save(excel_path)
            wb.close()
            return True, ""
        except PermissionError:
            return False, "Excel 文件正被 WPS / Microsoft Excel 占用，请先关闭表格再删除。"
        except Exception as e:
            return False, f"删除失败：{e}"


class _HtmlTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._skip = 0
        self.chunks = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() in ("script", "style", "noscript", "svg"):
            self._skip += 1
        elif tag.lower() in ("p", "div", "li", "tr", "br", "h1", "h2", "h3", "h4"):
            self.chunks.append("\n")

    def handle_endtag(self, tag):
        if tag.lower() in ("script", "style", "noscript", "svg") and self._skip > 0:
            self._skip -= 1

    def handle_data(self, data):
        if self._skip == 0 and data and data.strip():
            self.chunks.append(data.strip())


def fetch_webpage_text(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
        },
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
        try:
            html_str = raw.decode(charset, errors="replace")
        except Exception:
            html_str = raw.decode("utf-8", errors="replace")
    parser = _HtmlTextExtractor()
    parser.feed(html_str)
    text = " ".join(parser.chunks)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()[:18000]


def extract_json_object(raw_text: str) -> dict:
    s = (raw_text or "").strip()
    if not s:
        return {}
    try:
        return json.loads(s)
    except Exception:
        pass
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", s)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except Exception:
            pass
    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(s[start : end + 1])
        except Exception:
            pass
    return {}


def call_deepseek_api(
    ai_cfg: dict,
    messages: list,
    temperature: float = 0.4,
    max_tokens: int = 2000,
    json_mode: bool = True,
) -> dict:
    api_key = (ai_cfg.get("api_key") or "").strip()
    base_url = (ai_cfg.get("base_url") or "https://api.deepseek.com").strip().rstrip("/")
    model = (ai_cfg.get("model") or "deepseek-chat").strip()
    if not api_key:
        raise ValueError("尚未配置 DeepSeek API Key，请先点击右上角「设置与 AI」填入密钥。")

    endpoint = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode and "reasoner" not in model.lower():
        payload["response_format"] = {"type": "json_object"}

    body_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body_bytes,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = ""
        try:
            err_body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            pass
        if e.code == 401:
            raise RuntimeError("DeepSeek API Key 无效或已过期（401），请核对后重试。")
        if e.code == 402:
            raise RuntimeError("DeepSeek 账户余额不足（402），请先前往开放平台充值。")
        if e.code == 429:
            raise RuntimeError("DeepSeek 请求频率或并发超限（429），请稍等几秒再试。")
        raise RuntimeError(f"DeepSeek 接口返回 HTTP {e.code}：{err_body[:240] or e.reason}")
    except Exception as e:
        raise RuntimeError(f"连接 DeepSeek 失败：{e}")

    choices = data.get("choices") or []
    content = ""
    if choices:
        content = (choices[0].get("message") or {}).get("content", "")
    return {
        "content": content,
        "usage": data.get("usage") or {},
        "model": data.get("model") or model,
    }


def run_ai_copilot(cfg: dict, prof: dict, payload: dict) -> dict:
    ai_cfg = cfg.get("ai_config", {})
    sp = cfg.get("sender_profile", {})
    action_mode = payload.get("action_mode", "chat")
    user_message = (payload.get("user_message") or "").strip()
    history = payload.get("history") or []
    cur_subject = payload.get("current_subject") or ""
    cur_body = payload.get("current_body") or ""
    cur_hook = payload.get("current_hook") or prof.get("hook", "")

    mode_instructions = {
        "generate": "请根据申请人名片与导师信息，生成一封克制、真诚、学术感强、结构清晰的中文博士套磁首信。",
        "shorten": "请将当前邮件正文精简压缩到 380~450 字以内，保留核心成果与切入点，去掉客套废话，提高导师在手机端 30 秒读完的概率。",
        "polish": "请对当前邮件进行专业润色，去除空洞 AI 套话，强化科研表达逻辑与自然谦逊的学者口吻。",
        "translate_en": "请将当前套磁邮件翻译并改写为地道、得体的学术英文套磁信（含英文 Subject 与正文），避免机翻腔。",
        "hooks": "请基于导师研究方向与申请人科研背景，提炼 3 条具体且不编造论文细节的“研究契合切入点”，并给出最佳一条填入 suggested_hook。",
        "reply_followup": "请根据导师刚刚发来的回信内容，帮我草拟一封得体、礼貌、简明高效的跟进回信（回应老师关切并自然推进下一步沟通）。",
    }
    latest_reply = (payload.get("latest_reply") or "").strip()
    task_prompt = mode_instructions.get(action_mode) or user_message or "请协助优化当前套磁邮件。"

    system_prompt = """你是一位资深的高校博士申请学术通信顾问。你的任务是协助申请人打磨致博导的一对一套磁邮件。

核心约束（必须严格遵守）：
1. 绝对禁止编造事实：严禁虚构申请人未提供的论文标题、期刊等级、奖项、项目，也严禁编造导师的某篇具体论文标题（除非输入上下文里明确写出）。
2. 风格克制得体：避免浮夸营销词（如“久仰大名”“天作之合”“赋能”等 AI 腔），保持诚恳、平实、研究导向的学术沟通语气。
3. 必须严格输出合法 JSON 对象，字段如下：
{
  "reply": "给用户的简短中文说明或建议（1~3句话）",
  "suggested_subject": "建议的邮件主题（若本次仅提建议不改信可留空字符串）",
  "suggested_body": "完整可直接发送的邮件正文（若本次不改正文可留空字符串）",
  "suggested_hook": "建议的 1 句话套磁切入点（可选，不改可留空）"
}"""

    context_block = f"""【申请人名片】
- 姓名：{sp.get('name') or '未填写'}
- 所在院校：{sp.get('affiliation') or '未填写'}
- 学历与年级：{sp.get('degree_info') or '未填写'}
- 科研背景与代表成果：{sp.get('research_summary') or '未填写'}
- 联系方式：手机 {sp.get('phone') or '未填'} | 微信 {sp.get('wechat') or '未填'} | 主页 {sp.get('github') or '未填'}

【目标导师档案】
- 学校：{prof.get('sheet', '')}
- 姓名：{prof.get('name', '')}
- 学院：{prof.get('dept', '')}
- 职称：{prof.get('title', '')}
- 研究标签：{prof.get('tags', '')}
- 详细研究方向：{prof.get('research', '')}
- 当前套磁切入点：{cur_hook or '无'}

【当前编辑器内容】
主题：{cur_subject or '（空）'}
正文：
{cur_body or '（当前为空）'}"""
    if latest_reply:
        context_block += f"\n\n【导师最新回信内容】\n{latest_reply[:2000]}"

    messages = [{"role": "system", "content": system_prompt}]
    messages.append({"role": "user", "content": f"以下是本次任务的完整上下文：\n{context_block}"})
    messages.append({"role": "assistant", "content": '{"reply":"已读取申请人名片与该导师档案，请给出你的指令。","suggested_subject":"","suggested_body":"","suggested_hook":""}'})

    for h in history[-6:]:
        role = h.get("role")
        content = (h.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": f"请执行：{task_prompt}\n务必返回纯 JSON 对象。"})

    res = call_deepseek_api(ai_cfg, messages, temperature=0.45, max_tokens=2200, json_mode=True)
    parsed = extract_json_object(res["content"])
    if not parsed:
        return {
            "reply": res["content"] or "AI 未返回有效内容，请重试。",
            "suggested_subject": "",
            "suggested_body": "",
            "suggested_hook": "",
            "model": res["model"],
            "usage": res["usage"],
        }
    return {
        "reply": str(parsed.get("reply") or "已生成优化建议，请查看下方预览卡片。"),
        "suggested_subject": str(parsed.get("suggested_subject") or ""),
        "suggested_body": str(parsed.get("suggested_body") or ""),
        "suggested_hook": str(parsed.get("suggested_hook") or ""),
        "model": res["model"],
        "usage": res["usage"],
    }


def run_ai_extract_professors(cfg: dict, school: str, raw_text: str, page_url: str) -> dict:
    ai_cfg = cfg.get("ai_config", {})
    sp = cfg.get("sender_profile", {})
    source_text = (raw_text or "").strip()
    if not source_text and page_url:
        source_text = fetch_webpage_text(page_url)
    if not source_text:
        raise ValueError("请粘贴院系师资页面的文字内容，或填写有效的公开师资列表网址。")

    system_prompt = """你是一个严谨的高校导师信息提取助手。请从用户粘贴的网页文本中提取博士生导师/教师信息，并严格返回 JSON 对象：
{
  "professors": [
    {
      "name": "导师姓名",
      "dept": "学院或系所（未知留空）",
      "title": "职称与博导资格（如：教授 / 博导，未知留空）",
      "tags": "2~4个研究方向短标签，用 | 分隔",
      "research": "研究方向简明概括（100字以内）",
      "email": "文本中真实出现的邮箱地址（若文本中没有出现，必须留空字符串，严禁猜测或拼接邮箱！）",
      "homepage": "文本中出现的主页URL（没有则留空）",
      "priority": "结合申请人背景给出匹配度评价，必须从以下四档中选一个：极高匹配 / 高度匹配 / 可以尝试 / 待进一步了解",
      "note": "一句话匹配理由或待了解提示"
    }
  ]
}
注意：只提取真实出现在原文中的人名和邮箱，最多提取 30 位；若同一位导师有多条信息请合并。"""

    user_prompt = f"""目标高校：{school or '未指定'}
申请人研究方向背景：{sp.get('research_summary') or sp.get('degree_info') or '未填写（请按常规匹配度标注为“高度匹配”或“可以尝试”）'}

待提取文本如下：
{source_text[:15000]}"""

    res = call_deepseek_api(
        ai_cfg,
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        temperature=0.1,
        max_tokens=3600,
        json_mode=True,
    )
    parsed = extract_json_object(res["content"])
    profs = parsed.get("professors") if isinstance(parsed, dict) else []
    if not isinstance(profs, list):
        profs = []
    return {"professors": profs, "model": res["model"], "usage": res["usage"]}


def extract_domain(addr: str) -> str:
    if "@" not in (addr or ""):
        return ""
    return addr.split("@", 1)[1].strip().lower()


def interleave_by_domain(items: list) -> list:
    """Interleaves items so consecutive emails go to different recipient domains whenever possible."""
    buckets = {}
    for item in items:
        dom = extract_domain(item["email"])
        buckets.setdefault(dom, []).append(item)
    # Sort domains by descending bucket size to maximize separation
    result = []
    last_dom = None
    while any(buckets.values()):
        candidates = [d for d, lst in buckets.items() if lst]
        candidates.sort(key=lambda d: len(buckets[d]), reverse=True)
        picked = None
        for d in candidates:
            if d != last_dom:
                picked = d
                break
        if picked is None:
            picked = candidates[0]
        result.append(buckets[picked].pop(0))
        last_dom = picked
    return result


def build_dispatch_plan(
    cfg: dict,
    mode: str = "draft",
    selected_ids=None,
    ignore_quota: bool = False,
    scheduled_start_at: str = "",
) -> dict:
    profs = load_professors(cfg)
    today = today_str()
    start_dt = None
    if scheduled_start_at:
        try:
            start_dt = _parse_start_dt(scheduled_start_at)
        except Exception:
            start_dt = None
    target_date = start_dt.strftime("%Y-%m-%d") if (start_dt and start_dt > datetime.datetime.now()) else today
    is_future_date = target_date != today

    quota_used = get_quota_today(cfg, target_date=target_date) if mode == "send" else get_draft_count_today()
    accounts = cfg.get("accounts", [])
    enabled_accounts = [
        a for a in accounts
        if a.get("enabled") and a.get("email") and a.get("password") and a.get("smtp_host")
    ]
    acc_by_id = {a["id"]: a for a in accounts}
    remaining = {}
    planned_counts = {a["id"]: 0 for a in enabled_accounts}
    for a in enabled_accounts:
        lim = int(a.get("daily_limit", 5))
        used = quota_used.get(a["id"], 0)
        remaining[a["id"]] = max(0, lim - used) if mode == "send" else max(0, lim)

    policy = cfg.get("policy", {})
    max_mb = float(policy.get("max_attachment_mb", 2.5))
    avoid_same_dom = bool(policy.get("avoid_consecutive_same_domain", True))

    # Filter targets
    if selected_ids:
        id_set = set(selected_ids)
        targets = [p for p in profs if p["id"] in id_set]
    else:
        targets = [p for p in profs if p["status"] in ("待发送", "已确认待发")]

    if avoid_same_dom:
        targets = interleave_by_domain(targets)

    # Track already-sent emails in history to warn/prevent accidental duplicates
    sent_emails = {
        h.get("to_email", "").lower()
        for h in read_history()
        if h.get("mode") == "send" and h.get("ok")
    }

    plan_items = []
    last_domain_by_acc = {}

    for p in targets:
        issues = []
        warnings = []
        email_addr = p.get("email", "").strip()
        if "@" not in email_addr:
            issues.append("缺少有效收件邮箱")
        if not p.get("subject", "").strip():
            issues.append("缺少邮件主题")
        body_text = load_professor_body(cfg, p).strip()
        if not body_text:
            issues.append("缺少邮件正文")
        if not p.get("resume_exists"):
            warnings.append("未挂载 PDF 简历，将以纯文本发送")
        elif p.get("resume_size_mb", 0) > max_mb:
            warnings.append(f"附件 {p['resume_size_mb']} MB 超过建议上限 {max_mb} MB")
        if mode == "send" and email_addr.lower() in sent_emails:
            warnings.append("历史记录显示已向该邮箱发送过，请确认是否重复发送")

        # Determine account
        preferred = p.get("assigned_sender", "自动分配")
        chosen_acc = None
        dom = extract_domain(email_addr)

        if preferred and preferred != "自动分配":
            a = acc_by_id.get(preferred)
            if not a or not a.get("enabled"):
                issues.append(f"指定发件箱【{preferred}】未启用")
            elif not a.get("email") or not a.get("password"):
                issues.append(f"指定发件箱【{preferred}】未填邮箱或授权码")
            elif remaining.get(preferred, 0) <= 0 and not (mode == "send" and ignore_quota):
                issues.append(f"指定发件箱【{preferred}】今日配额已满")
            else:
                chosen_acc = a
                if remaining.get(preferred, 0) <= 0 and mode == "send" and ignore_quota:
                    warnings.append(f"【{preferred}】已超今日配额上限，按个人选择强行排入")
        else:
            avail = [a for a in enabled_accounts if remaining.get(a["id"], 0) > 0]
            if avail:
                avail.sort(
                    key=lambda a: (
                        0 if last_domain_by_acc.get(a["id"]) != dom else 1,
                        -remaining.get(a["id"], 0),
                    )
                )
                chosen_acc = avail[0]
            elif mode == "send" and ignore_quota and enabled_accounts:
                # Fairly distribute across enabled accounts when user explicitly overrides quota limit
                candidates = sorted(
                    enabled_accounts,
                    key=lambda a: (
                        0 if last_domain_by_acc.get(a["id"]) != dom else 1,
                        planned_counts.get(a["id"], 0) + quota_used.get(a["id"], 0),
                    ),
                )
                chosen_acc = candidates[0]
                warnings.append("已达今日默认配额，已按你的选择继续轮换排入")
            else:
                issues.append("可用发件箱配额已满（可勾选下方「忽略配额限制」或点击「重置配额」自主调整）")

        if chosen_acc and not issues:
            if remaining.get(chosen_acc["id"], 0) > 0:
                remaining[chosen_acc["id"]] -= 1
            planned_counts[chosen_acc["id"]] = planned_counts.get(chosen_acc["id"], 0) + 1
            last_domain_by_acc[chosen_acc["id"]] = dom

        plan_items.append({
            "id": p["id"],
            "sheet": p["sheet"],
            "row": p["row"],
            "name": p["name"],
            "dept": p["dept"],
            "priority": p["priority"],
            "to_email": email_addr,
            "domain": dom,
            "subject": p.get("subject", ""),
            "resume_name": p.get("resume_name", ""),
            "resume_path": p.get("effective_resume_path", ""),
            "resume_size_mb": p.get("resume_size_mb", 0),
            "account_id": chosen_acc["id"] if chosen_acc else "",
            "from_email": chosen_acc["email"] if chosen_acc else "",
            "ready": len(issues) == 0,
            "issues": issues,
            "warnings": warnings,
        })

    acc_summary = []
    for a in accounts:
        lim = int(a.get("daily_limit", 5))
        used = quota_used.get(a["id"], 0) if mode == "send" else 0
        planned = sum(1 for it in plan_items if it["ready"] and it["account_id"] == a["id"])
        acc_summary.append({
            "id": a["id"],
            "label": a.get("label", a["id"]),
            "email": a.get("email", ""),
            "enabled": bool(a.get("enabled")),
            "configured": bool(a.get("email") and a.get("password")),
            "daily_limit": lim,
            "used_today": used,
            "planned": planned,
            "remaining_after": max(0, lim - used - planned),
        })

    return {
        "mode": mode,
        "total": len(plan_items),
        "ready_count": sum(1 for it in plan_items if it["ready"]),
        "blocked_count": sum(1 for it in plan_items if not it["ready"]),
        "items": plan_items,
        "accounts": acc_summary,
        "ignore_quota": ignore_quota,
        "target_date": target_date,
        "is_future_date": is_future_date,
        "last_send_batch": get_last_send_batch_summary(),
    }


def build_mime_message(
    account: dict,
    to_email: str,
    subject: str,
    body: str,
    resume_path: str,
    in_reply_to: str = "",
    references: str = "",
) -> MIMEMultipart:
    msg = MIMEMultipart()
    display_name = account.get("display_name") or account.get("email")
    msg["From"] = email.utils.formataddr((str(Header(display_name, "utf-8")), account["email"]))
    msg["To"] = to_email
    msg["Subject"] = Header(subject, "utf-8")
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg["Message-ID"] = email.utils.make_msgid()
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to.strip()
        refs = f"{references.strip()} {in_reply_to.strip()}".strip() if references else in_reply_to.strip()
        msg["References"] = refs

    msg.attach(MIMEText(body, "plain", "utf-8"))

    if resume_path and os.path.isfile(resume_path):
        with open(resume_path, "rb") as f:
            pdf_bytes = f.read()
        att = MIMEApplication(pdf_bytes, _subtype="pdf")
        fname = os.path.basename(resume_path)
        # Clean RFC 2231 + fallback filename for Chinese PDF attachment names across Coremail/Outlook/163
        att.add_header("Content-Disposition", "attachment", filename=("utf-8", "", fname))
        msg.attach(att)

    return msg


def imap_send_id_if_needed(imap: imaplib.IMAP4_SSL, host: str):
    """NetEase 163/126/yeah require RFC 2971 IMAP ID command after login, otherwise APPEND/SELECT fails."""
    if any(k in (host or "").lower() for k in ("163.com", "126.com", "yeah.net")):
        try:
            imaplib.Commands["ID"] = ("AUTH", "SELECTED")
            args = '("name" "PhDOutreachWorkbench" "version" "1.0.0" "vendor" "local")'
            imap._simple_command("ID", args)
        except Exception:
            pass


def _extract_imap_folder_name(line: str) -> str:
    m = re.search(r'"([^"]+)"\s*$', line)
    if m:
        return m.group(1)
    parts = line.split()
    return parts[-1].strip('"') if parts else ""


def _detect_imap_folder(imap: imaplib.IMAP4_SSL, attr_flag: str, fallback_names: tuple, preferred: str) -> str:
    try:
        typ, data = imap.list()
        if typ == "OK" and data:
            lines = [raw.decode("utf-8", errors="ignore") for raw in data]
            for line in lines:
                if attr_flag and attr_flag in line:
                    fname = _extract_imap_folder_name(line)
                    if fname:
                        return fname
            lowered_fallbacks = {n.lower(): n for n in fallback_names}
            for line in lines:
                fname = _extract_imap_folder_name(line)
                if fname.lower() in lowered_fallbacks:
                    return fname
    except Exception:
        pass
    return preferred


def detect_drafts_folder(imap: imaplib.IMAP4_SSL, preferred: str) -> str:
    return _detect_imap_folder(imap, "\\Drafts", ("Drafts", "&g0l6P3ux-"), preferred or "Drafts")


def detect_proxy_hint(host: str, err_msg: str) -> str:
    """Checks whether DNS resolved to Clash/Mihomo Fake-IP (198.18.0.0/15) or hit proxy TLS EOF."""
    if not host:
        return ""
    resolved_ip = ""
    try:
        resolved_ip = socket.gethostbyname(host)
    except Exception:
        pass
    low = (err_msg or "").lower()
    if resolved_ip.startswith("198.18.") or resolved_ip.startswith("198.19."):
        return f"（检测到 {host} 被解析为代理假 IP {resolved_ip}，梯子 TUN/全局代理通常会拦截 SMTP 发信端口；请关闭梯子/TUN 模式或将邮箱域名设为直连后重试）"
    if "unexpected_eof" in low or "timed out" in low:
        return "（连接被中途断开或超时，如当前开启了梯子/代理软件的 TUN 模式，请尝试关闭梯子或切换直连后重试）"
    return ""


def send_via_smtp(account: dict, msg: MIMEMultipart, to_email: str) -> None:
    host = account["smtp_host"]
    port = int(account.get("smtp_port", 465))
    sec = (account.get("smtp_security") or "SSL").upper()
    ctx = ssl.create_default_context()
    if hasattr(ssl, "OP_IGNORE_UNEXPECTED_EOF"):
        ctx.options |= ssl.OP_IGNORE_UNEXPECTED_EOF
    if sec == "SSL":
        with smtplib.SMTP_SSL(host, port, timeout=25, context=ctx) as server:
            server.login(account["email"], account["password"])
            server.sendmail(account["email"], [to_email], msg.as_bytes())
    elif sec == "STARTTLS":
        with smtplib.SMTP(host, port, timeout=25) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.ehlo()
            server.login(account["email"], account["password"])
            server.sendmail(account["email"], [to_email], msg.as_bytes())
    else:
        with smtplib.SMTP(host, port, timeout=25) as server:
            server.ehlo()
            server.login(account["email"], account["password"])
            server.sendmail(account["email"], [to_email], msg.as_bytes())


def _append_imap_message(
    account: dict,
    msg: MIMEMultipart,
    attr_flag: str,
    fallback_names: tuple,
    preferred_folder: str,
    imap_flags: str,
) -> str:
    host = account.get("imap_host", "")
    port = int(account.get("imap_port", 993))
    if not host:
        raise ValueError("该邮箱未配置 IMAP 服务器地址")
    ctx = ssl.create_default_context()
    if hasattr(ssl, "OP_IGNORE_UNEXPECTED_EOF"):
        ctx.options |= ssl.OP_IGNORE_UNEXPECTED_EOF
    with imaplib.IMAP4_SSL(host, port, ssl_context=ctx, timeout=15) as imap:
        imap.login(account["email"], account["password"])
        imap_send_id_if_needed(imap, host)
        folder = _detect_imap_folder(imap, attr_flag, fallback_names, preferred_folder)
        folder_arg = f'"{folder}"' if (" " in folder or "[" in folder) else folder
        typ, resp = imap.append(folder_arg, imap_flags, imaplib.Time2Internaldate(time.time()), msg.as_bytes())
        if typ != "OK":
            raise RuntimeError(f"IMAP APPEND 返回异常：{resp}")
        return folder


def save_to_imap_drafts(account: dict, msg: MIMEMultipart) -> str:
    return _append_imap_message(
        account, msg, "\\Drafts", ("Drafts", "&g0l6P3ux-"), account.get("drafts_folder", "Drafts"), "\\Draft"
    )


def save_to_imap_sent(account: dict, msg: MIMEMultipart) -> str:
    return _append_imap_message(
        account, msg, "\\Sent", ("Sent", "Sent Messages", "Sent Items", "&XfJT0ZAB-"), "Sent", "\\Seen"
    )


def _normalize_subject_key(subj: str) -> str:
    s = (subj or "").strip()
    while True:
        ns = re.sub(r"^(?:re|fwd|fw|回复|转发|答复)\s*[:：]\s*", "", s, flags=re.IGNORECASE).strip()
        if ns == s:
            break
        s = ns
    return s.lower()


def _decode_mime_header_str(raw: str) -> str:
    if not raw:
        return ""
    parts = []
    for chunk, charset in email.header.decode_header(raw):
        if isinstance(chunk, bytes):
            enc = charset or "utf-8"
            try:
                parts.append(chunk.decode(enc, errors="replace"))
            except Exception:
                parts.append(chunk.decode("utf-8", errors="replace"))
        else:
            parts.append(str(chunk))
    return "".join(parts).strip()


def _extract_email_body_and_attachments(msg_obj) -> tuple:
    plain_parts = []
    html_parts = []
    attachments = []

    if msg_obj.is_multipart():
        for part in msg_obj.walk():
            cdisp = str(part.get("Content-Disposition") or "").lower()
            fname = part.get_filename()
            if fname or "attachment" in cdisp:
                if fname:
                    attachments.append(_decode_mime_header_str(fname))
                continue
            ctype = (part.get_content_type() or "").lower()
            if ctype not in ("text/plain", "text/html"):
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            cs = part.get_content_charset() or "utf-8"
            try:
                text = payload.decode(cs, errors="replace")
            except Exception:
                text = payload.decode("utf-8", errors="replace")
            if ctype == "text/plain":
                plain_parts.append(text)
            else:
                html_parts.append(text)
    else:
        payload = msg_obj.get_payload(decode=True)
        if payload:
            cs = msg_obj.get_content_charset() or "utf-8"
            try:
                text = payload.decode(cs, errors="replace")
            except Exception:
                text = payload.decode("utf-8", errors="replace")
            if (msg_obj.get_content_type() or "").lower() == "text/html":
                html_parts.append(text)
            else:
                plain_parts.append(text)

    body = "\n".join(p.strip() for p in plain_parts if p and p.strip()).strip()
    if not body and html_parts:
        parser = _HtmlTextExtractor()
        parser.feed("\n".join(html_parts))
        body = re.sub(r"\n{3,}", "\n\n", "\n".join(parser.chunks)).strip()
    return body, attachments


def load_mail_threads() -> dict:
    with THREADS_LOCK:
        if not THREADS_PATH.is_file():
            return {"messages": [], "seen_uids": {}, "last_sync_at": ""}
        try:
            data = json.loads(THREADS_PATH.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                return {"messages": [], "seen_uids": {}, "last_sync_at": ""}
            data.setdefault("messages", [])
            data.setdefault("seen_uids", {})
            data.setdefault("last_sync_at", "")
            return data
        except Exception:
            return {"messages": [], "seen_uids": {}, "last_sync_at": ""}


def save_mail_threads(store: dict) -> None:
    with THREADS_LOCK:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        THREADS_PATH.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")


def record_thread_message(entry: dict) -> dict:
    with THREADS_LOCK:
        store = load_mail_threads()
        msgs = store["messages"]
        mid = (entry.get("message_id") or "").strip()
        if mid and any((m.get("message_id") or "").strip() == mid and m.get("direction") == entry.get("direction") for m in msgs):
            return entry
        entry.setdefault("id", f"msg-{int(time.time() * 1000)}-{random.randint(100, 999)}")
        entry.setdefault("timestamp", now_str())
        msgs.append(entry)
        # Keep bounded clean history (latest 2000 messages)
        if len(msgs) > 2000:
            store["messages"] = msgs[-2000:]
        save_mail_threads(store)
        return entry


def get_thread_for_professor(prof: dict) -> list:
    pid = prof.get("id", "")
    pemail = (prof.get("email") or "").strip().lower()
    store = load_mail_threads()
    matched = []
    for m in store.get("messages", []):
        if m.get("professor_id") == pid:
            matched.append(m)
            continue
        if pemail:
            fe = (m.get("from_email") or "").strip().lower()
            te = (m.get("to_email") or "").strip().lower()
            if fe == pemail or te == pemail:
                matched.append(m)
    matched.sort(key=lambda x: x.get("timestamp") or "")
    return matched


def get_unread_replies_summary(profs: list) -> tuple:
    store = load_mail_threads()
    by_id = {p["id"]: p for p in profs}
    by_email = {(p.get("email") or "").strip().lower(): p for p in profs if (p.get("email") or "").strip()}
    unread_list = []
    reply_counts = {}
    for m in store.get("messages", []):
        if m.get("direction") != "inbound":
            continue
        prof = by_id.get(m.get("professor_id", "")) or by_email.get((m.get("from_email") or "").strip().lower())
        pid = prof["id"] if prof else (m.get("professor_id") or "")
        if pid:
            reply_counts[pid] = reply_counts.get(pid, 0) + 1
        if m.get("unread"):
            snippet = re.sub(r"\s+", " ", (m.get("body") or "").strip())[:110]
            unread_list.append({
                "msg_id": m.get("id", ""),
                "professor_id": pid,
                "professor_name": prof["name"] if prof else (m.get("from_name") or m.get("from_email") or "导师"),
                "school": prof["sheet"] if prof else "",
                "from_email": m.get("from_email", ""),
                "subject": m.get("subject", ""),
                "snippet": snippet,
                "timestamp": m.get("timestamp", ""),
            })
    unread_list.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return unread_list, reply_counts, store.get("last_sync_at", "")


def mark_replies_read(professor_id: str = "", mark_all: bool = False) -> int:
    with THREADS_LOCK:
        store = load_mail_threads()
        changed = 0
        for m in store.get("messages", []):
            if m.get("direction") == "inbound" and m.get("unread"):
                if mark_all or (professor_id and m.get("professor_id") == professor_id):
                    m["unread"] = False
                    changed += 1
        if changed:
            save_mail_threads(store)
        return changed


def sync_inbox_replies(cfg: dict, force_full: bool = False) -> dict:
    """Fetches INBOX via IMAP strictly whitelisted to contacted professor emails / reply threads."""
    if not IMAP_SYNC_LOCK.acquire(blocking=False):
        profs = load_professors(cfg)
        unread_list, reply_counts, last_sync = get_unread_replies_summary(profs)
        return {
            "ok": True,
            "busy": True,
            "new_replies": [],
            "unread_replies": unread_list,
            "unread_count": len(unread_list),
            "reply_counts": reply_counts,
            "last_sync_at": last_sync,
            "errors": [],
        }

    try:
        profs = load_professors(cfg)
        accounts = [
            a for a in cfg.get("accounts", [])
            if a.get("enabled") and a.get("email") and a.get("password") and a.get("imap_host")
        ]
        if not accounts:
            unread_list, reply_counts, last_sync = get_unread_replies_summary(profs)
            return {
                "ok": True,
                "skipped": True,
                "reason": "尚未配置可用的 IMAP 发件箱授权码",
                "new_replies": [],
                "unread_replies": unread_list,
                "unread_count": len(unread_list),
                "reply_counts": reply_counts,
                "last_sync_at": last_sync,
                "errors": [],
            }

        store = load_mail_threads()
        history = read_history()
        # Build strict contacted-professor whitelist: emails, message_ids, normalized subjects
        contacted_email_map = {}
        outbound_msg_ids = {}
        outbound_subj_map = {}
        prof_by_email = {(p.get("email") or "").strip().lower(): p for p in profs if (p.get("email") or "").strip()}
        prof_by_id = {p["id"]: p for p in profs}

        for p in profs:
            em = (p.get("email") or "").strip().lower()
            st = p.get("status") or ""
            if em and (st in ("已发送", "已回信") or st.startswith("已回复") or p.get("sent_time")):
                contacted_email_map[em] = p
                sk = _normalize_subject_key(p.get("subject", ""))
                if len(sk) >= 4:
                    outbound_subj_map[sk] = p

        for h in history:
            if h.get("mode") == "send" and h.get("ok"):
                te = (h.get("to_email") or "").strip().lower()
                p = prof_by_id.get(h.get("id", "")) or prof_by_email.get(te)
                if te:
                    contacted_email_map[te] = p or {"id": h.get("id", ""), "name": h.get("name", te), "sheet": h.get("school", ""), "email": te}
                sk = _normalize_subject_key(h.get("subject", ""))
                if len(sk) >= 4 and p:
                    outbound_subj_map[sk] = p

        for m in store.get("messages", []):
            if m.get("direction") == "outbound":
                te = (m.get("to_email") or "").strip().lower()
                p = prof_by_id.get(m.get("professor_id", "")) or prof_by_email.get(te)
                if te and p:
                    contacted_email_map[te] = p
                mid = (m.get("message_id") or "").strip()
                if mid and p:
                    outbound_msg_ids[mid] = p
                sk = _normalize_subject_key(m.get("subject", ""))
                if len(sk) >= 4 and p:
                    outbound_subj_map[sk] = p

        if not contacted_email_map and not outbound_msg_ids:
            store["last_sync_at"] = now_str()
            save_mail_threads(store)
            unread_list, reply_counts, last_sync = get_unread_replies_summary(profs)
            return {
                "ok": True,
                "new_replies": [],
                "unread_replies": unread_list,
                "unread_count": len(unread_list),
                "reply_counts": reply_counts,
                "last_sync_at": last_sync,
                "errors": [],
            }

        own_emails = {(a.get("email") or "").strip().lower() for a in cfg.get("accounts", [])}
        existing_mids = {
            (m.get("message_id") or "").strip()
            for m in store.get("messages", [])
            if m.get("direction") == "inbound" and m.get("message_id")
        }

        new_replies = []
        errors = []
        seen_uids = store.setdefault("seen_uids", {})

        for acc in accounts:
            acc_key = f"{acc['id']}::{acc['email'].lower()}"
            last_uid = 0 if force_full else int(seen_uids.get(acc_key, 0) or 0)
            host = acc.get("imap_host", "")
            port = int(acc.get("imap_port", 993))
            try:
                ctx = ssl.create_default_context()
                if hasattr(ssl, "OP_IGNORE_UNEXPECTED_EOF"):
                    ctx.options |= ssl.OP_IGNORE_UNEXPECTED_EOF
                with imaplib.IMAP4_SSL(host, port, ssl_context=ctx, timeout=18) as imap:
                    imap.login(acc["email"], acc["password"])
                    imap_send_id_if_needed(imap, host)
                    typ, _ = imap.select("INBOX", readonly=True)
                    if typ != "OK":
                        continue

                    if last_uid > 0:
                        st_s, uid_data = imap.uid("search", None, f"UID {last_uid + 1}:*")
                    else:
                        st_s, uid_data = imap.uid("search", None, "ALL")
                    if st_s != "OK" or not uid_data or not uid_data[0]:
                        continue

                    all_uids = [int(u) for u in uid_data[0].split() if u.isdigit()]
                    if last_uid > 0:
                        target_uids = [u for u in all_uids if u > last_uid][-60:]
                    else:
                        target_uids = all_uids[-60:]

                    max_uid_seen = last_uid
                    for uid in target_uids:
                        if uid > max_uid_seen:
                            max_uid_seen = uid
                        st_h, hdr_data = imap.uid(
                            "fetch",
                            str(uid),
                            "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)])",
                        )
                        if st_h != "OK" or not hdr_data:
                            continue
                        raw_hdr = b""
                        for part in hdr_data:
                            if isinstance(part, tuple) and len(part) >= 2 and isinstance(part[1], (bytes, bytearray)):
                                raw_hdr = bytes(part[1])
                                break
                        if not raw_hdr:
                            continue

                        hmsg = email.message_from_bytes(raw_hdr)
                        from_raw = _decode_mime_header_str(hmsg.get("From", ""))
                        from_name, from_addr = email.utils.parseaddr(from_raw)
                        from_addr = (from_addr or "").strip().lower()
                        if not from_addr or from_addr in own_emails:
                            continue

                        subj = _decode_mime_header_str(hmsg.get("Subject", ""))
                        mid = (hmsg.get("Message-ID") or f"imap-{acc_key}-{uid}").strip()
                        if mid in existing_mids:
                            continue

                        in_reply = (hmsg.get("In-Reply-To") or "").strip()
                        refs = (hmsg.get("References") or "").strip()
                        subj_key = _normalize_subject_key(subj)

                        matched_prof = contacted_email_map.get(from_addr)
                        if not matched_prof and in_reply:
                            for tok in (in_reply + " " + refs).split():
                                if tok in outbound_msg_ids:
                                    matched_prof = outbound_msg_ids[tok]
                                    break
                        if not matched_prof and subj_key and subj_key in outbound_subj_map:
                            if re.match(r"^(?:re|回复|答复)\s*[:：]", subj.strip(), flags=re.IGNORECASE):
                                matched_prof = outbound_subj_map[subj_key]

                        if not matched_prof:
                            continue

                        # Whitelist hit! Now fetch full body
                        st_f, full_data = imap.uid("fetch", str(uid), "(BODY.PEEK[])")
                        if st_f != "OK" or not full_data:
                            continue
                        raw_full = b""
                        for part in full_data:
                            if isinstance(part, tuple) and len(part) >= 2 and isinstance(part[1], (bytes, bytearray)):
                                raw_full = bytes(part[1])
                                break
                        if not raw_full:
                            continue

                        full_msg = email.message_from_bytes(raw_full)
                        body_text, att_names = _extract_email_body_and_attachments(full_msg)
                        dt_raw = full_msg.get("Date", "")
                        try:
                            dt_parsed = email.utils.parsedate_to_datetime(dt_raw)
                            if dt_parsed.tzinfo is not None:
                                dt_parsed = dt_parsed.astimezone()
                            ts_str = dt_parsed.strftime("%Y-%m-%d %H:%M:%S")
                        except Exception:
                            ts_str = now_str()

                        entry = {
                            "id": f"in-{uid}-{int(time.time() * 1000)}",
                            "direction": "inbound",
                            "unread": True,
                            "professor_id": matched_prof.get("id", ""),
                            "school": matched_prof.get("sheet", ""),
                            "professor_name": matched_prof.get("name", from_name or from_addr),
                            "account_id": acc["id"],
                            "from_name": from_name or matched_prof.get("name", ""),
                            "from_email": from_addr,
                            "to_email": acc["email"],
                            "subject": subj or "（无主题）",
                            "body": body_text or "（邮件正文为空或仅包含图片/附件）",
                            "attachments": att_names,
                            "message_id": mid,
                            "in_reply_to": in_reply,
                            "timestamp": ts_str,
                        }
                        store["messages"].append(entry)
                        existing_mids.add(mid)
                        new_replies.append({
                            "msg_id": entry["id"],
                            "professor_id": entry["professor_id"],
                            "professor_name": entry["professor_name"],
                            "school": entry["school"],
                            "from_email": from_addr,
                            "subject": entry["subject"],
                            "snippet": re.sub(r"\s+", " ", entry["body"]).strip()[:110],
                            "timestamp": ts_str,
                        })

                        # Update professor status in Excel -> 已回信
                        if matched_prof.get("sheet") and matched_prof.get("row"):
                            snippet_short = re.sub(r"\s+", " ", entry["body"]).strip()[:80]
                            old_note = (matched_prof.get("reply_note") or "").strip()
                            line = f"[{ts_str[:16]} 回信] {snippet_short}"
                            merged_note = f"{line}\n{old_note}".strip() if old_note else line
                            update_excel_row(
                                cfg,
                                matched_prof["sheet"],
                                int(matched_prof["row"]),
                                {"status": "已回信", "reply_note": merged_note},
                            )

                    if max_uid_seen > last_uid:
                        seen_uids[acc_key] = max_uid_seen
            except Exception as e:
                errors.append(f"{acc['id']}: {e}")

        store["last_sync_at"] = now_str()
        save_mail_threads(store)
        unread_list, reply_counts, last_sync = get_unread_replies_summary(load_professors(cfg))
        return {
            "ok": True,
            "new_replies": new_replies,
            "unread_replies": unread_list,
            "unread_count": len(unread_list),
            "reply_counts": reply_counts,
            "last_sync_at": last_sync,
            "errors": errors,
        }
    finally:
        IMAP_SYNC_LOCK.release()


def test_account_connection(account: dict) -> dict:
    res = {"smtp_ok": False, "smtp_msg": "", "imap_ok": False, "imap_msg": ""}
    if not account.get("email") or not account.get("password"):
        res["smtp_msg"] = "请先填写邮箱地址和授权码/密码"
        return res

    # SMTP test
    try:
        host = account["smtp_host"]
        port = int(account.get("smtp_port", 465))
        sec = (account.get("smtp_security") or "SSL").upper()
        ctx = ssl.create_default_context()
        if hasattr(ssl, "OP_IGNORE_UNEXPECTED_EOF"):
            ctx.options |= ssl.OP_IGNORE_UNEXPECTED_EOF
        if sec == "SSL":
            with smtplib.SMTP_SSL(host, port, timeout=15, context=ctx) as server:
                server.login(account["email"], account["password"])
        elif sec == "STARTTLS":
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                server.starttls(context=ctx)
                server.ehlo()
                server.login(account["email"], account["password"])
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                server.login(account["email"], account["password"])
        res["smtp_ok"] = True
        res["smtp_msg"] = "SMTP 登录验证通过"
    except Exception as e:
        msg = str(e)
        hint = ""
        if "535" in msg:
            if "163" in account.get("smtp_host", ""):
                hint = "（提示：163 邮箱必须填客户端授权码，不能填网页登录密码）"
            elif "office365" in account.get("smtp_host", "") or "outlook" in account.get("smtp_host", ""):
                hint = "（提示：微软个人 Outlook 已逐步限制传统密码认证，建议改用学校邮箱或 163 邮箱）"
        if not hint:
            hint = detect_proxy_hint(account.get("smtp_host", ""), msg)
        res["smtp_msg"] = f"SMTP 失败：{msg}{hint}"

    # IMAP test
    if account.get("imap_host"):
        try:
            ctx = ssl.create_default_context()
            with imaplib.IMAP4_SSL(account["imap_host"], int(account.get("imap_port", 993)), ssl_context=ctx) as imap:
                imap.login(account["email"], account["password"])
                imap_send_id_if_needed(imap, account["imap_host"])
                folder = detect_drafts_folder(imap, account.get("drafts_folder", "Drafts"))
            res["imap_ok"] = True
            res["imap_msg"] = f"IMAP 登录通过（草稿箱：{folder}）"
        except Exception as e:
            res["imap_msg"] = f"IMAP 失败：{e}"
    else:
        res["imap_msg"] = "未配置 IMAP（仅影响写入草稿箱功能）"

    return res


def compress_pdf_hd(input_pdf: Path, output_pdf: Path, dpi: int = 400) -> tuple:
    """Compresses PDF using TeX Live Ghostscript (rungs) at 400 DPI 4:4:4 HD while keeping all vector text lossless."""
    rungs = shutil.which("rungs")
    if not rungs:
        return False, "未检测到 Ghostscript (rungs) 压缩组件；若您的简历 PDF 体积小于 2.5 MB，可直接作为附件发送，无需压缩。"
    if not input_pdf.is_file():
        return False, f"源文件不存在：{input_pdf}"

    with tempfile.TemporaryDirectory() as td:
        tmp_in = Path(td) / "in.pdf"
        tmp_out = Path(td) / "out.pdf"
        shutil.copy2(input_pdf, tmp_in)
        cmd = [
            rungs,
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.6",
            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",
            f"-sOutputFile={tmp_out}",
            "-dDetectDuplicateImages=true",
            "-dCompressFonts=true",
            "-dSubsetFonts=true",
            "-dDownsampleColorImages=true",
            "-dColorImageDownsampleType=/Bicubic",
            f"-dColorImageResolution={dpi}",
            "-dColorImageDownsampleThreshold=1.1",
            "-dDownsampleGrayImages=true",
            "-dGrayImageDownsampleType=/Bicubic",
            f"-dGrayImageResolution={dpi}",
            "-dGrayImageDownsampleThreshold=1.1",
            "-dAutoFilterColorImages=false",
            "-dColorImageFilter=/DCTEncode",
            "-c",
            "<</ColorImageDict << /QFactor 0.12 /Blend 1 /HSamples [1 1 1 1] /VSamples [1 1 1 1] >> >> setdistillerparams",
            "-f",
            str(tmp_in),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0 or not tmp_out.is_file() or tmp_out.stat().st_size == 0:
            return False, f"Ghostscript 压缩失败：{r.stderr.strip() or r.stdout.strip()}"
        output_pdf.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tmp_out, output_pdf)
        return True, f"已生成 {dpi} DPI 高清压缩版（{output_pdf.stat().st_size / (1024 * 1024):.2f} MB）"


def run_batch_worker(cfg: dict, mode: str, ready_items: list, start_dt: datetime.datetime = None):
    acc_by_id = {a["id"]: a for a in cfg.get("accounts", [])}
    policy = cfg.get("policy", {})
    min_d = max(5, int(policy.get("min_delay_sec", 180)))
    max_d = max(min_d, int(policy.get("max_delay_sec", 420)))

    def log_line(msg: str):
        with JOB_LOCK:
            ACTIVE_JOB["logs"].append(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}")

    if start_dt and start_dt > datetime.datetime.now():
        log_line(f"已设定定时任务：将于 {start_dt.strftime('%Y-%m-%d %H:%M:%S')} 自动启动{'写入草稿箱' if mode == 'draft' else 'SMTP 防封慢速发送'}（共 {len(ready_items)} 封），期间可随时点击停止取消。")
    else:
        log_line(f"启动批量任务：模式={'写入草稿箱' if mode == 'draft' else 'SMTP 防封慢速发送'}，共 {len(ready_items)} 封")

    try:
        # Optional scheduled wait loop before first send
        if start_dt:
            cancelled_during_wait = False
            while True:
                now_dt = datetime.datetime.now()
                rem_sec = int((start_dt - now_dt).total_seconds())
                if rem_sec <= 0:
                    break
                with JOB_LOCK:
                    if ACTIVE_JOB["stop_requested"]:
                        cancelled_during_wait = True
                        break
                    ACTIVE_JOB["schedule_wait_seconds"] = rem_sec
                    ACTIVE_JOB["waiting_seconds"] = rem_sec
                time.sleep(1)
            with JOB_LOCK:
                ACTIVE_JOB["schedule_wait_seconds"] = 0
                ACTIVE_JOB["waiting_seconds"] = 0
            if cancelled_during_wait:
                log_line("已收到终止指令，定时队列在开始前已取消。")
                return
            log_line(f"已到达预定时间（{start_dt.strftime('%Y-%m-%d %H:%M:%S')}），正式开始执行队列...")

        for idx, item in enumerate(ready_items):
            should_stop = False
            with JOB_LOCK:
                if ACTIVE_JOB["stop_requested"]:
                    should_stop = True
                else:
                    ACTIVE_JOB["current_item"] = item
                    ACTIVE_JOB["waiting_seconds"] = 0
                    ACTIVE_JOB["next_item"] = ready_items[idx + 1] if idx + 1 < len(ready_items) else None
                    ACTIVE_JOB["items"][idx]["exec_status"] = "processing"
            if should_stop:
                log_line("已收到终止指令，停止后续队列。")
                break

            acc = acc_by_id.get(item["account_id"])
            prof_stub = {"sheet": item["sheet"], "name": item["name"], "body_path": ""}
            body_text = load_professor_body(cfg, prof_stub)
            if not body_text:
                # Fallback load via full excel lookup
                for p in load_professors(cfg):
                    if p["id"] == item["id"]:
                        body_text = load_professor_body(cfg, p)
                        break

            ok = False
            err_msg = ""
            try:
                msg = build_mime_message(acc, item["to_email"], item["subject"], body_text, item["resume_path"])
                if mode == "draft":
                    folder = save_to_imap_drafts(acc, msg)
                    ok = True
                    log_line(f"成功写入草稿箱：{item['sheet']} {item['name']} ← {acc['id']} ({folder})")
                    new_status = "待发送"
                    upd = {"status": new_status, "assigned_sender": acc["id"]}
                else:
                    send_via_smtp(acc, msg, item["to_email"])
                    ok = True
                    ts = now_short()
                    log_line(f"发送成功：{item['sheet']} {item['name']} ({item['to_email']}) ← {acc['id']}")
                    new_status = "已发送"
                    upd = {"status": new_status, "assigned_sender": acc["id"], "sent_time": ts}
                    record_thread_message({
                        "direction": "outbound",
                        "unread": False,
                        "professor_id": item["id"],
                        "school": item["sheet"],
                        "professor_name": item["name"],
                        "account_id": acc["id"],
                        "from_email": acc["email"],
                        "to_email": item["to_email"],
                        "subject": item["subject"],
                        "body": body_text,
                        "attachments": [item["resume_name"]] if item.get("resume_name") else [],
                        "message_id": str(msg.get("Message-ID") or ""),
                        "timestamp": now_str(),
                    })

                ex_ok, ex_err = update_excel_row(cfg, item["sheet"], item["row"], upd)
                if not ex_ok:
                    log_line(f"提示：{item['name']} {ex_err}")
            except Exception as e:
                raw_err = str(e)
                hint = detect_proxy_hint(acc.get("smtp_host", "") if acc else "", raw_err) if mode != "draft" else ""
                err_msg = f"{raw_err}{hint}"
                log_line(f"失败：{item['sheet']} {item['name']} ← {item['account_id']} | {err_msg}")

            append_history({
                "timestamp": now_str(),
                "date": today_str(),
                "mode": mode,
                "ok": ok,
                "error": err_msg,
                "id": item["id"],
                "school": item["sheet"],
                "name": item["name"],
                "to_email": item["to_email"],
                "account_id": item["account_id"],
                "from_email": item["from_email"],
                "subject": item["subject"],
                "resume_name": item["resume_name"],
            })

            with JOB_LOCK:
                ACTIVE_JOB["completed"] += 1
                if ok:
                    ACTIVE_JOB["succeeded"] += 1
                    ACTIVE_JOB["items"][idx]["exec_status"] = "ok"
                    ACTIVE_JOB["items"][idx]["exec_msg"] = "已写入草稿箱" if mode == "draft" else f"已发送 ({now_short()})"
                else:
                    ACTIVE_JOB["failed"] += 1
                    ACTIVE_JOB["items"][idx]["exec_status"] = "error"
                    ACTIVE_JOB["items"][idx]["exec_msg"] = err_msg

            # Only sleep after a successful send/draft; never sleep on failure
            if idx < len(ready_items) - 1:
                if not ok:
                    log_line("本封处理失败，跳过休眠，立即处理下一封...")
                    continue
                delay = 2 if mode == "draft" else random.randint(min_d, max_d)
                if mode == "send":
                    log_line(f"防封随机休眠 {delay} 秒后发送下一封（{ready_items[idx + 1]['sheet']} {ready_items[idx + 1]['name']}）...")
                for rem in range(delay, 0, -1):
                    with JOB_LOCK:
                        if ACTIVE_JOB["stop_requested"]:
                            break
                        ACTIVE_JOB["waiting_seconds"] = rem
                    time.sleep(1)
    finally:
        with JOB_LOCK:
            ACTIVE_JOB["running"] = False
            ACTIVE_JOB["waiting_seconds"] = 0
            ACTIVE_JOB["schedule_wait_seconds"] = 0
            ACTIVE_JOB["scheduled_start_at"] = ""
            ACTIVE_JOB["current_item"] = None
            ACTIVE_JOB["next_item"] = None
            ACTIVE_JOB["finished_at"] = now_str()
            succ = ACTIVE_JOB["succeeded"]
            fail = ACTIVE_JOB["failed"]
            tot = ACTIVE_JOB["total"]
        log_line(f"任务结束：成功 {succ} / 失败 {fail} / 总计 {tot}")


class WorkbenchHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Quiet concise console log
        pass

    def send_json(self, payload: dict, status: int = 200):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/" or path == "/index.html":
                idx_file = STATIC_DIR / "index.html"
                if not idx_file.is_file():
                    tip = (
                        "<!DOCTYPE html><html><meta charset='utf-8'><body style='font-family:sans-serif;padding:40px;line-height:1.8'>"
                        "<h2>PhD_AdvisorContact_System — Frontend Not Built Yet</h2>"
                        "<p>Run <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code> and refresh this page, "
                        "or run <code>npm run dev</code> and open <code>http://localhost:5173</code>.</p></body></html>"
                    ).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(tip)))
                    self.end_headers()
                    self.wfile.write(tip)
                    return
                return self.serve_file(idx_file, "text/html; charset=utf-8")
            if path.startswith("/static/"):
                rel = path[len("/static/"):]
                fpath = (STATIC_DIR / rel).resolve()
                if STATIC_DIR.resolve() not in fpath.parents or not fpath.is_file():
                    self.send_error(404)
                    return
                ctype, _ = mimetypes.guess_type(str(fpath))
                suf = fpath.suffix.lower()
                if suf == ".js":
                    ctype = "application/javascript; charset=utf-8"
                elif suf == ".css":
                    ctype = "text/css; charset=utf-8"
                elif suf == ".woff2":
                    ctype = "font/woff2"
                elif suf == ".woff":
                    ctype = "font/woff"
                elif suf == ".ttf":
                    ctype = "font/ttf"
                elif suf == ".svg":
                    ctype = "image/svg+xml"
                return self.serve_file(fpath, ctype or "application/octet-stream")

            if path == "/api/bootstrap":
                cfg = load_config()
                profs = load_professors(cfg)
                safe_cfg = json.loads(json.dumps(cfg))
                for acc in safe_cfg.get("accounts", []):
                    pw = acc.get("password") or ""
                    acc["has_password"] = bool(pw)
                    acc["password_len"] = len(pw)
                    acc["password"] = ""
                ai_cfg = safe_cfg.setdefault("ai_config", {})
                raw_key = ai_cfg.get("api_key") or ""
                ai_cfg["has_api_key"] = bool(raw_key)
                ai_cfg["api_key_len"] = len(raw_key)
                ai_cfg["api_key"] = ""
                sheets = []
                for p in profs:
                    if p["sheet"] not in sheets:
                        sheets.append(p["sheet"])
                with JOB_LOCK:
                    job_snap = json.loads(json.dumps(ACTIVE_JOB))
                unread_replies, reply_counts, last_sync_at = get_unread_replies_summary(profs)
                return self.send_json({
                    "ok": True,
                    "config": safe_cfg,
                    "professors": profs,
                    "sheets": sheets,
                    "excel_path": cfg.get("excel_path", ""),
                    "excel_filename": Path(cfg.get("excel_path", "")).name if cfg.get("excel_path") else "",
                    "quota_today": get_quota_today(cfg),
                    "last_send_batch": get_last_send_batch_summary(),
                    "history": read_history()[-40:][::-1],
                    "job": job_snap,
                    "unread_replies": unread_replies,
                    "reply_counts": reply_counts,
                    "last_sync_at": last_sync_at,
                })

            if path == "/api/mail/threads":
                pid = (qs.get("id") or [""])[0]
                mark_r = (qs.get("mark_read") or ["0"])[0] == "1"
                cfg = load_config()
                profs = load_professors(cfg)
                prof = next((p for p in profs if p["id"] == pid), None)
                if not prof:
                    return self.send_json({"ok": False, "error": "未找到该导师记录"}, 404)
                if mark_r:
                    mark_replies_read(professor_id=pid)
                msgs = get_thread_for_professor(prof)
                unread_replies, reply_counts, last_sync_at = get_unread_replies_summary(profs)
                return self.send_json({
                    "ok": True,
                    "messages": msgs,
                    "unread_replies": unread_replies,
                    "reply_counts": reply_counts,
                    "last_sync_at": last_sync_at,
                })

            if path == "/api/professor/detail":
                pid = (qs.get("id") or [""])[0]
                cfg = load_config()
                profs = load_professors(cfg)
                prof = next((p for p in profs if p["id"] == pid), None)
                if not prof:
                    return self.send_json({"ok": False, "error": "未找到该导师记录"}, 404)
                body = load_professor_body(cfg, prof)
                return self.send_json({"ok": True, "professor": prof, "body": body})

            if path == "/api/pdf/view":
                raw_p = (qs.get("path") or [""])[0]
                cfg = load_config()
                p = resolve_user_path(raw_p, cfg)
                if not p or not p.is_file() or not is_safe_path(p, cfg) or p.suffix.lower() != ".pdf":
                    self.send_error(404, "PDF not found")
                    return
                data = p.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Disposition", "inline")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
                return

            if path == "/api/job/status":
                with JOB_LOCK:
                    snap = json.loads(json.dumps(ACTIVE_JOB))
                return self.send_json({
                    "ok": True,
                    "instance_id": INSTANCE_ID,
                    "job": snap,
                    "quota_today": get_quota_today(),
                    "last_send_batch": get_last_send_batch_summary(),
                })

            self.send_error(404)
        except Exception as e:
            self.send_json({"ok": False, "error": str(e)}, 500)

    def serve_file(self, fpath: Path, content_type: str):
        data = fpath.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            data = self.read_json()
            cfg = load_config()

            if path == "/api/professor/save":
                pid = data.get("id", "")
                if "::" not in pid:
                    return self.send_json({"ok": False, "error": "无效的导师 ID"}, 400)
                sheet, row_s = pid.split("::", 1)
                row = int(row_s)
                name = data.get("name", "")
                subject = data.get("subject", "")
                body = data.get("body", "")

                # Save email body to task directory
                task_dir = get_task_dir(cfg, sheet, name)
                body_path_to_store = data.get("body_path", "")
                if body.strip() or subject.strip():
                    task_dir.mkdir(parents=True, exist_ok=True)
                    body_file = task_dir / "email.txt"
                    body_file.write_text(body, encoding="utf-8")
                    meta_file = task_dir / "meta.json"
                    meta_file.write_text(json.dumps({
                        "school": sheet,
                        "name": name,
                        "subject": subject,
                        "updated_at": now_str(),
                    }, ensure_ascii=False, indent=2), encoding="utf-8")
                    body_path_to_store = str(body_file)

                updates = {
                    "priority": data.get("priority"),
                    "email": data.get("email"),
                    "note": data.get("note"),
                    "in_batch": data.get("in_batch"),
                    "assigned_sender": data.get("assigned_sender"),
                    "status": data.get("status"),
                    "hook": data.get("hook"),
                    "subject": subject,
                    "body_path": body_path_to_store,
                    "resume_path": data.get("resume_path"),
                    "reply_note": data.get("reply_note"),
                }
                ex_ok, ex_err = update_excel_row(cfg, sheet, row, updates)
                return self.send_json({
                    "ok": True,
                    "excel_synced": ex_ok,
                    "excel_warning": "" if ex_ok else ex_err,
                    "body_path": body_path_to_store,
                })

            if path == "/api/professor/quick_update":
                pid = data.get("id", "")
                sheet, row_s = pid.split("::", 1)
                updates = data.get("updates", {})
                ex_ok, ex_err = update_excel_row(cfg, sheet, int(row_s), updates)
                return self.send_json({"ok": ex_ok, "error": ex_err})

            if path == "/api/professor/generate_draft":
                pid = data.get("id", "")
                profs = load_professors(cfg)
                prof = next((p for p in profs if p["id"] == pid), None)
                if not prof:
                    return self.send_json({"ok": False, "error": "未找到导师"}, 404)
                # Use latest hook from request if edited
                if "hook" in data:
                    prof["hook"] = data["hook"]
                draft = generate_smart_draft(cfg, prof)
                return self.send_json({"ok": True, "subject": draft["subject"], "body": draft["body"]})

            if path == "/api/professor/upload_resume":
                pid = data.get("id", "")
                sheet, row_s = pid.split("::", 1)
                name = data.get("name", "")
                b64 = data.get("content_base64", "")
                orig_fname = sanitize_filename(data.get("filename", "resume.pdf"))
                if not orig_fname.lower().endswith(".pdf"):
                    orig_fname += ".pdf"
                pdf_bytes = base64.b64decode(b64)
                task_dir = get_task_dir(cfg, sheet, name)
                task_dir.mkdir(parents=True, exist_ok=True)
                target = task_dir / orig_fname
                target.write_bytes(pdf_bytes)
                ex_ok, ex_err = update_excel_row(cfg, sheet, int(row_s), {"resume_path": str(target)})
                size_mb = round(target.stat().st_size / (1024 * 1024), 2)
                return self.send_json({
                    "ok": True,
                    "resume_path": str(target),
                    "resume_name": target.name,
                    "resume_size_mb": size_mb,
                    "excel_synced": ex_ok,
                    "excel_warning": "" if ex_ok else ex_err,
                })

            if path == "/api/pdf/compress":
                raw_p = data.get("path", "")
                pid = data.get("id", "")
                dpi = int(data.get("dpi", 400))
                src = resolve_user_path(raw_p, cfg)
                if not src.is_file() or not is_safe_path(src, cfg):
                    return self.send_json({"ok": False, "error": "无效的 PDF 文件路径"}, 400)
                if src.stem.endswith("_高清压缩版"):
                    out_p = src
                else:
                    out_p = src.with_name(f"{src.stem}_高清压缩版.pdf")
                ok, msg = compress_pdf_hd(src, out_p, dpi=dpi)
                if not ok:
                    return self.send_json({"ok": False, "error": msg}, 500)
                if pid and "::" in pid:
                    sheet, row_s = pid.split("::", 1)
                    update_excel_row(cfg, sheet, int(row_s), {"resume_path": str(out_p)})
                return self.send_json({
                    "ok": True,
                    "message": msg,
                    "resume_path": str(out_p),
                    "resume_name": out_p.name,
                    "resume_size_mb": round(out_p.stat().st_size / (1024 * 1024), 2),
                })

            if path == "/api/config/save":
                old_by_id = {a["id"]: a for a in cfg.get("accounts", [])}
                new_accounts = data.get("accounts", [])
                for acc in new_accounts:
                    lookup_id = acc.pop("orig_id", "") or acc.get("id", "")
                    pw_dirty = acc.pop("password_dirty", False)
                    old_acc = old_by_id.get(lookup_id, {})
                    if not pw_dirty and not acc.get("password"):
                        # Keep existing stored password unless user explicitly edited it
                        if not acc.get("clear_password") and lookup_id in old_by_id:
                            acc["password"] = old_acc.get("password", "")
                    if "last_test" not in acc and "last_test" in old_acc:
                        if acc.get("email") == old_acc.get("email") and acc.get("password") == old_acc.get("password"):
                            acc["last_test"] = old_acc["last_test"]
                    acc.pop("has_password", None)
                    acc.pop("password_len", None)
                    acc.pop("clear_password", None)
                cfg["accounts"] = new_accounts
                if "policy" in data:
                    cfg["policy"] = data["policy"]
                if "default_resume_path" in data:
                    cfg["default_resume_path"] = data["default_resume_path"]
                if "sender_profile" in data:
                    cfg["sender_profile"] = data["sender_profile"]
                if "ai_config" in data:
                    old_ai = cfg.get("ai_config", {})
                    new_ai = dict(data["ai_config"] or {})
                    key_dirty = new_ai.pop("api_key_dirty", False)
                    clear_key = new_ai.pop("clear_api_key", False)
                    if not key_dirty and not new_ai.get("api_key") and not clear_key:
                        new_ai["api_key"] = old_ai.get("api_key", "")
                    new_ai.pop("has_api_key", None)
                    new_ai.pop("api_key_len", None)
                    cfg["ai_config"] = new_ai
                save_config(cfg)
                return self.send_json({"ok": True})

            if path == "/api/config/upload_default_resume":
                b64 = data.get("content_base64", "")
                orig_fname = sanitize_filename(data.get("filename", "default_resume.pdf"))
                if not orig_fname.lower().endswith(".pdf"):
                    orig_fname += ".pdf"
                pdf_bytes = base64.b64decode(b64)
                res_dir = BASE_DIR / "resumes"
                res_dir.mkdir(parents=True, exist_ok=True)
                target = res_dir / orig_fname
                target.write_bytes(pdf_bytes)
                rel_path = str(Path("resumes") / orig_fname)
                cfg["default_resume_path"] = rel_path
                save_config(cfg)
                size_mb = round(target.stat().st_size / (1024 * 1024), 2)
                return self.send_json({
                    "ok": True,
                    "default_resume_path": rel_path,
                    "resume_name": orig_fname,
                    "resume_size_mb": size_mb,
                })

            if path == "/api/professor/create":
                school = (data.get("sheet") or "").strip() or "新增高校"
                name = (data.get("name") or "").strip()
                if not name:
                    return self.send_json({"ok": False, "error": "请填写导师姓名"}, 400)
                res = append_professors_to_excel(cfg, school, [data])
                if not res.get("ok"):
                    return self.send_json({"ok": False, "error": res.get("error", "添加失败")}, 500)
                if res.get("added", 0) == 0:
                    return self.send_json({"ok": False, "error": "该高校分页中已存在同名或同邮箱导师"}, 409)
                return self.send_json({"ok": True, **res})

            if path == "/api/professors/import":
                school = (data.get("school") or "").strip() or "新增高校"
                items = data.get("professors") or []
                if not items:
                    return self.send_json({"ok": False, "error": "没有可导入的导师条目"}, 400)
                res = append_professors_to_excel(cfg, school, items)
                if not res.get("ok"):
                    return self.send_json({"ok": False, "error": res.get("error", "导入失败")}, 500)
                return self.send_json({"ok": True, **res})

            if path == "/api/ai/test":
                saved_ai = cfg.get("ai_config", {})
                test_ai = {
                    "provider": "deepseek",
                    "base_url": (data.get("base_url") or saved_ai.get("base_url") or "https://api.deepseek.com").strip(),
                    "model": (data.get("model") or saved_ai.get("model") or "deepseek-chat").strip(),
                    "api_key": (data.get("api_key") or "").strip() if data.get("api_key_dirty") else ((data.get("api_key") or "").strip() or saved_ai.get("api_key", "")),
                }
                t0 = time.time()
                res = call_deepseek_api(
                    test_ai,
                    [{"role": "user", "content": "请回复 OK"}],
                    temperature=0.0,
                    max_tokens=16,
                    json_mode=False,
                )
                ms = int((time.time() - t0) * 1000)
                if test_ai["api_key"]:
                    cfg["ai_config"] = test_ai
                    save_config(cfg)
                return self.send_json({"ok": True, "latency_ms": ms, "model": res["model"], "message": f"DeepSeek API 连接成功（{ms} ms）并已保存"})

            if path == "/api/ai/chat":
                pid = data.get("professor_id", "")
                profs = load_professors(cfg)
                prof = next((p for p in profs if p["id"] == pid), None)
                if not prof:
                    return self.send_json({"ok": False, "error": "请先选择一位目标导师"}, 400)
                result = run_ai_copilot(cfg, prof, data)
                return self.send_json({"ok": True, **result})

            if path == "/api/ai/extract_professors":
                school = (data.get("school") or "").strip()
                raw_text = data.get("raw_text") or ""
                page_url = (data.get("page_url") or "").strip()
                result = run_ai_extract_professors(cfg, school, raw_text, page_url)
                return self.send_json({"ok": True, **result})

            if path == "/api/accounts/test":
                acc_id = data.get("account_id", "")
                new_id = (data.get("new_id") or acc_id).strip()
                pw_dirty = bool(data.get("password_dirty", False))
                override_pw = data.get("password", "")
                acc = next((a for a in cfg.get("accounts", []) if a["id"] == acc_id), None)
                test_acc = dict(acc) if acc else {"id": new_id or acc_id}
                # Merge unsaved form fields if provided (works for newly added accounts too)
                for k in ("email", "smtp_host", "smtp_port", "smtp_security", "imap_host", "imap_port", "drafts_folder", "note"):
                    if k in data and data[k] not in (None, ""):
                        test_acc[k] = data[k]
                if "enabled" in data:
                    test_acc["enabled"] = bool(data["enabled"])
                if "daily_limit" in data and data["daily_limit"]:
                    test_acc["daily_limit"] = int(data["daily_limit"])
                if pw_dirty or (override_pw and not acc):
                    test_acc["password"] = override_pw
                elif override_pw and not test_acc.get("password"):
                    test_acc["password"] = override_pw

                result = test_account_connection(test_acc)
                result["tested_at"] = now_short()

                auto_saved = False
                if result.get("smtp_ok"):
                    test_acc["id"] = new_id or test_acc.get("id", acc_id)
                    test_acc["label"] = test_acc["id"]
                    test_acc["last_test"] = result
                    if acc is not None:
                        acc.update(test_acc)
                    else:
                        sp = cfg.get("sender_profile", {})
                        sname = (sp.get("name") or "").strip()
                        saff = (sp.get("affiliation") or "").strip()
                        dname = f"{sname}（{saff}）" if (sname and saff) else sname
                        test_acc.setdefault("display_name", dname)
                        cfg.setdefault("accounts", []).append(test_acc)
                    save_config(cfg)
                    auto_saved = True
                elif acc is not None:
                    acc["last_test"] = result
                    save_config(cfg)

                return self.send_json({"ok": True, "result": result, "auto_saved": auto_saved})

            if path == "/api/quota/reset":
                cfg["quota_reset_after"] = now_str()
                save_config(cfg)
                return self.send_json({
                    "ok": True,
                    "quota_today": get_quota_today(cfg),
                    "quota_reset_after": cfg["quota_reset_after"],
                })

            if path == "/api/dispatch/plan":
                mode = data.get("mode", "draft")
                selected_ids = data.get("ids")
                ignore_quota = bool(data.get("ignore_quota", False))
                start_at = data.get("start_at", "") or ""
                plan = build_dispatch_plan(
                    cfg,
                    mode=mode,
                    selected_ids=selected_ids,
                    ignore_quota=ignore_quota,
                    scheduled_start_at=start_at,
                )
                return self.send_json({"ok": True, "plan": plan})

            if path == "/api/dispatch/test_self":
                test_to = (data.get("test_to") or "").strip()
                acc_id = data.get("account_id", "")
                subject = data.get("subject", "")
                body = data.get("body", "")
                resume_path = data.get("resume_path", "")
                if "@" not in test_to:
                    return self.send_json({"ok": False, "error": "请填写有效的测试收件邮箱"}, 400)
                acc = next((a for a in cfg.get("accounts", []) if a["id"] == acc_id), None)
                if not acc or not acc.get("email") or not acc.get("password"):
                    return self.send_json({"ok": False, "error": f"发件箱【{acc_id}】尚未配置邮箱或授权码"}, 400)
                eff_res = (
                    str(resolve_user_path(resume_path, cfg))
                    if resume_path
                    else str(resolve_app_path(cfg.get("default_resume_path", "")))
                )
                msg = build_mime_message(acc, test_to, f"[测试落箱] {subject}", body, eff_res)
                send_via_smtp(acc, msg, test_to)
                return self.send_json({"ok": True, "message": f"测试邮件已通过【{acc['id']}】发送至 {test_to}，请检查是否直达收件箱"})

            if path == "/api/dispatch/start":
                with JOB_LOCK:
                    if ACTIVE_JOB["running"]:
                        return self.send_json({"ok": False, "error": "当前已有批量任务正在运行，请等待完成或先终止"}, 409)
                mode = data.get("mode", "draft")
                selected_ids = data.get("ids")
                ignore_quota = bool(data.get("ignore_quota", False))
                start_at_raw = (data.get("start_at") or "").strip()
                start_dt = _parse_start_dt(start_at_raw) if start_at_raw else None
                if start_dt and start_dt <= datetime.datetime.now():
                    start_dt = None
                    start_at_raw = ""

                plan = build_dispatch_plan(
                    cfg,
                    mode=mode,
                    selected_ids=selected_ids,
                    ignore_quota=ignore_quota,
                    scheduled_start_at=start_at_raw,
                )
                ready_items = [it for it in plan["items"] if it["ready"]]
                if not ready_items:
                    return self.send_json({"ok": False, "error": "没有符合发送条件的就绪邮件（请先检查主题、正文、邮箱及发件箱配额）"}, 400)

                for it in ready_items:
                    it["exec_status"] = "pending"
                    it["exec_msg"] = "等待定时启动" if start_dt else "排队中"

                init_wait = int((start_dt - datetime.datetime.now()).total_seconds()) if start_dt else 0
                with JOB_LOCK:
                    ACTIVE_JOB.update({
                        "running": True,
                        "stop_requested": False,
                        "mode": mode,
                        "started_at": now_str(),
                        "finished_at": "",
                        "scheduled_start_at": start_dt.strftime("%Y-%m-%d %H:%M:%S") if start_dt else "",
                        "schedule_wait_seconds": max(0, init_wait),
                        "total": len(ready_items),
                        "completed": 0,
                        "succeeded": 0,
                        "failed": 0,
                        "current_item": None,
                        "waiting_seconds": max(0, init_wait),
                        "next_item": ready_items[0],
                        "items": ready_items,
                        "logs": [],
                    })

                t = threading.Thread(target=run_batch_worker, args=(cfg, mode, ready_items, start_dt), daemon=True)
                t.start()
                return self.send_json({
                    "ok": True,
                    "total": len(ready_items),
                    "scheduled_start_at": start_dt.strftime("%Y-%m-%d %H:%M:%S") if start_dt else "",
                })

            if path == "/api/dispatch/stop":
                with JOB_LOCK:
                    ACTIVE_JOB["stop_requested"] = True
                return self.send_json({"ok": True})

            if path == "/api/professor/delete":
                pid = data.get("id", "")
                if "::" not in pid:
                    return self.send_json({"ok": False, "error": "无效的导师 ID"}, 400)
                sheet, row_s = pid.split("::", 1)
                ok_d, err_d = delete_professor_from_excel(cfg, sheet, int(row_s))
                if not ok_d:
                    return self.send_json({"ok": False, "error": err_d}, 500)
                return self.send_json({"ok": True})

            if path == "/api/mail/send_single":
                pid = (data.get("professor_id") or "").strip()
                to_email = (data.get("to_email") or "").strip()
                subject = (data.get("subject") or "").strip()
                body = (data.get("body") or "").strip()
                acc_id = (data.get("account_id") or "").strip()
                in_reply_to = (data.get("in_reply_to") or "").strip()
                references = (data.get("references") or "").strip()
                include_attachment = data.get("include_attachment", True)
                resume_path_raw = (data.get("resume_path") or "").strip()
                custom_att_name = (data.get("attachment_filename") or "").strip()
                custom_att_b64 = (data.get("attachment_base64") or "").strip()

                if "@" not in to_email:
                    return self.send_json({"ok": False, "error": "请填写有效的收件邮箱地址"}, 400)
                if not subject:
                    return self.send_json({"ok": False, "error": "请填写邮件主题"}, 400)
                if not body:
                    return self.send_json({"ok": False, "error": "邮件正文不能为空"}, 400)

                accounts = cfg.get("accounts", [])
                acc = None
                if acc_id and acc_id != "自动分配":
                    acc = next((a for a in accounts if a["id"] == acc_id), None)
                if not acc:
                    acc = next((a for a in accounts if a.get("enabled") and a.get("email") and a.get("password") and a.get("smtp_host")), None)
                if not acc or not acc.get("email") or not acc.get("password") or not acc.get("smtp_host"):
                    return self.send_json({"ok": False, "error": "尚未配置可用的发件箱，请先在右上角「设置」中填写邮箱与客户端授权码"}, 400)

                profs = load_professors(cfg)
                prof = next((p for p in profs if p["id"] == pid), None) if pid else None

                # Resolve attachment path
                eff_att_path = ""
                att_display_name = ""
                tmp_att_file = None
                if custom_att_b64 and custom_att_name:
                    safe_fn = sanitize_filename(custom_att_name)
                    att_bytes = base64.b64decode(custom_att_b64)
                    tmp_dir = BASE_DIR / "outbox" / "_quick_attachments"
                    tmp_dir.mkdir(parents=True, exist_ok=True)
                    tmp_att_file = tmp_dir / f"{int(time.time())}_{safe_fn}"
                    tmp_att_file.write_bytes(att_bytes)
                    eff_att_path = str(tmp_att_file)
                    att_display_name = safe_fn
                elif include_attachment:
                    if resume_path_raw:
                        rp = resolve_user_path(resume_path_raw, cfg)
                        if rp and rp.is_file():
                            eff_att_path = str(rp)
                            att_display_name = rp.name
                    elif prof and prof.get("effective_resume_path") and os.path.isfile(prof["effective_resume_path"]):
                        eff_att_path = prof["effective_resume_path"]
                        att_display_name = os.path.basename(eff_att_path)
                    elif not pid:
                        dp = resolve_app_path(cfg.get("default_resume_path", ""))
                        if dp.is_file():
                            eff_att_path = str(dp)
                            att_display_name = dp.name

                msg = build_mime_message(
                    acc, to_email, subject, body, eff_att_path,
                    in_reply_to=in_reply_to, references=references,
                )
                try:
                    send_via_smtp(acc, msg, to_email)
                except Exception as e:
                    hint = detect_proxy_hint(acc.get("smtp_host", ""), str(e))
                    return self.send_json({"ok": False, "error": f"发送失败：{e}{hint}"}, 500)

                # If freehand compose requested auto-contact creation
                if not prof and data.get("auto_add_contact", True):
                    contact_name = (data.get("contact_name") or "").strip() or to_email.split("@")[0]
                    contact_school = (data.get("contact_school") or "").strip() or "自由联系"
                    append_professors_to_excel(cfg, contact_school, [{
                        "name": contact_name,
                        "email": to_email,
                        "priority": "高度匹配",
                        "status": "已发送",
                        "in_batch": True,
                    }])
                    profs = load_professors(cfg)
                    prof = next(
                        (p for p in profs if (p.get("email") or "").strip().lower() == to_email.lower()),
                        None,
                    )

                ts_short = now_short()
                ts_full = now_str()
                prof_id_final = prof["id"] if prof else ""
                prof_school = prof["sheet"] if prof else (data.get("contact_school") or "自由联系")
                prof_name = prof["name"] if prof else (data.get("contact_name") or to_email.split("@")[0])

                # Save email text file & update Excel if linked to a professor
                excel_warning = ""
                if prof:
                    task_dir = get_task_dir(cfg, prof["sheet"], prof["name"])
                    task_dir.mkdir(parents=True, exist_ok=True)
                    if not in_reply_to:
                        body_file = task_dir / "email.txt"
                        body_file.write_text(body, encoding="utf-8")
                        body_path_val = str(body_file)
                    else:
                        body_path_val = prof.get("body_path", "")
                    next_status = "已回信" if (prof.get("status") == "已回信" or in_reply_to) else "已发送"
                    ex_ok, ex_err = update_excel_row(cfg, prof["sheet"], prof["row"], {
                        "email": to_email,
                        "assigned_sender": acc["id"],
                        "status": next_status,
                        "subject": prof.get("subject") or subject if in_reply_to else subject,
                        "body_path": body_path_val,
                        "sent_time": ts_short,
                    })
                    if not ex_ok:
                        excel_warning = ex_err

                sent_entry = record_thread_message({
                    "direction": "outbound",
                    "unread": False,
                    "professor_id": prof_id_final,
                    "school": prof_school,
                    "professor_name": prof_name,
                    "account_id": acc["id"],
                    "from_email": acc["email"],
                    "to_email": to_email,
                    "subject": subject,
                    "body": body,
                    "attachments": [att_display_name] if att_display_name else [],
                    "message_id": str(msg.get("Message-ID") or ""),
                    "in_reply_to": in_reply_to,
                    "timestamp": ts_full,
                })

                append_history({
                    "timestamp": ts_full,
                    "date": today_str(),
                    "mode": "send",
                    "ok": True,
                    "error": "",
                    "id": prof_id_final,
                    "school": prof_school,
                    "name": prof_name,
                    "to_email": to_email,
                    "account_id": acc["id"],
                    "from_email": acc["email"],
                    "subject": subject,
                    "resume_name": att_display_name,
                })

                return self.send_json({
                    "ok": True,
                    "message": f"已通过【{acc['id']}】发送给 {prof_name}（{to_email}）",
                    "excel_warning": excel_warning,
                    "professor_id": prof_id_final,
                    "sent_entry": sent_entry,
                })

            if path == "/api/mail/save_single_draft":
                to_email = (data.get("to_email") or "").strip()
                subject = (data.get("subject") or "").strip()
                body = (data.get("body") or "").strip()
                acc_id = (data.get("account_id") or "").strip()
                resume_path_raw = (data.get("resume_path") or "").strip()
                if "@" not in to_email or not subject:
                    return self.send_json({"ok": False, "error": "请先填写收件邮箱和邮件主题"}, 400)
                accounts = cfg.get("accounts", [])
                acc = next((a for a in accounts if a["id"] == acc_id), None) if (acc_id and acc_id != "自动分配") else None
                if not acc:
                    acc = next((a for a in accounts if a.get("enabled") and a.get("email") and a.get("password") and a.get("imap_host")), None)
                if not acc or not acc.get("imap_host") or not acc.get("password"):
                    return self.send_json({"ok": False, "error": "尚未配置可用的 IMAP 发件箱授权码"}, 400)
                eff_res = ""
                if resume_path_raw:
                    rp = resolve_user_path(resume_path_raw, cfg)
                    if rp and rp.is_file():
                        eff_res = str(rp)
                msg = build_mime_message(acc, to_email, subject, body, eff_res)
                folder = save_to_imap_drafts(acc, msg)
                return self.send_json({"ok": True, "message": f"已保存到【{acc['id']}】的邮箱草稿箱（{folder}）"})

            if path == "/api/mail/sync_replies":
                force_full = bool(data.get("force_full", False))
                res = sync_inbox_replies(cfg, force_full=force_full)
                return self.send_json(res)

            if path == "/api/mail/mark_read":
                pid = (data.get("professor_id") or "").strip()
                mark_all = bool(data.get("all", False))
                changed = mark_replies_read(professor_id=pid, mark_all=mark_all)
                profs = load_professors(cfg)
                unread_replies, reply_counts, last_sync_at = get_unread_replies_summary(profs)
                return self.send_json({
                    "ok": True,
                    "marked": changed,
                    "unread_replies": unread_replies,
                    "reply_counts": reply_counts,
                    "last_sync_at": last_sync_at,
                })

            self.send_error(404)
        except Exception as e:
            self.send_json({"ok": False, "error": str(e)}, 500)


def is_workbench_alive(url: str) -> bool:
    import urllib.request
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f"{url}/api/job/status", timeout=1.5) as r:
            if r.status != 200:
                return False
            data = json.loads(r.read().decode("utf-8"))
            return data.get("instance_id") == INSTANCE_ID
    except Exception:
        return False


class LocalWorkbenchServer(ThreadingHTTPServer):
    # On Windows, keep allow_reuse_address=False so duplicate launches cleanly detect port in use
    allow_reuse_address = False


def ensure_stdio():
    """In PyInstaller --noconsole mode on Windows, stdout/stderr are None."""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / "workbench.log"
    if sys.stdout is None:
        sys.stdout = open(log_path, "a", encoding="utf-8", buffering=1)
    if sys.stderr is None:
        sys.stderr = open(log_path, "a", encoding="utf-8", buffering=1)


def run_gui_controller(server: LocalWorkbenchServer, url: str, no_browser: bool) -> bool:
    """Starts HTTP server in background and shows a minimal Warm-Editorial desktop controller."""
    try:
        import tkinter as tk
        from tkinter import messagebox
    except Exception:
        return False

    srv_thread = threading.Thread(target=server.serve_forever, daemon=True)
    srv_thread.start()

    if not no_browser:
        threading.Timer(0.45, lambda: webbrowser.open(url)).start()

    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass

    root = tk.Tk()
    root.title("申博轻邮工作台 · 本地服务")
    root.configure(bg="#F8F9FB")
    root.resizable(False, False)

    card = tk.Frame(root, bg="#FFFFFF", highlightbackground="#E5E7EB", highlightthickness=1)
    card.pack(fill="both", expand=True, padx=14, pady=14)

    top_row = tk.Frame(card, bg="#FFFFFF")
    top_row.pack(fill="x", padx=18, pady=(16, 4))
    dot = tk.Canvas(top_row, width=10, height=10, bg="#FFFFFF", highlightthickness=0)
    dot.create_oval(1, 1, 9, 9, fill="#2E5D48", outline="")
    dot.pack(side="left", padx=(0, 8))
    tk.Label(
        top_row,
        text="本地套磁工作台运行中",
        font=("Microsoft YaHei UI", 12, "bold"),
        bg="#FFFFFF",
        fg="#1C1917",
    ).pack(side="left")

    tk.Label(
        card,
        text=f"访问地址：{url}",
        font=("Consolas", 10),
        bg="#FFFFFF",
        fg="#1F3B34",
        anchor="w",
    ).pack(fill="x", padx=18, pady=(2, 2))

    tk.Label(
        card,
        text="所有邮件、授权码与表格仅保存在本机。关闭此窗口将停止本地服务。",
        font=("Microsoft YaHei UI", 9),
        bg="#FFFFFF",
        fg="#78716C",
        anchor="w",
        wraplength=336,
        justify="left",
    ).pack(fill="x", padx=18, pady=(0, 14))

    btn_row = tk.Frame(card, bg="#FFFFFF")
    btn_row.pack(fill="x", padx=18, pady=(0, 14))

    def open_web():
        webbrowser.open(url)

    def open_folder():
        try:
            os.startfile(str(BASE_DIR))
        except Exception as e:
            messagebox.showerror("无法打开文件夹", str(e), parent=root)

    def shutdown_and_quit():
        with JOB_LOCK:
            busy = bool(ACTIVE_JOB["running"])
        if busy:
            ok = messagebox.askyesno(
                "批量任务正在运行",
                "当前仍有批量写草稿或发信任务未完成，确认强制退出本地服务吗？",
                parent=root,
            )
            if not ok:
                return
        try:
            server.shutdown()
            server.server_close()
        except Exception:
            pass
        root.destroy()

    tk.Button(
        btn_row,
        text="打开工作台网页",
        command=open_web,
        bg="#18181B",
        fg="#FFFFFF",
        activebackground="#27272A",
        activeforeground="#FFFFFF",
        relief="flat",
        font=("Microsoft YaHei UI", 9, "bold"),
        padx=12,
        pady=6,
        cursor="hand2",
    ).pack(side="left")

    tk.Button(
        btn_row,
        text="打开数据目录",
        command=open_folder,
        bg="#F9F8F4",
        fg="#1C1917",
        activebackground="#EAE6DD",
        relief="solid",
        bd=1,
        font=("Microsoft YaHei UI", 9),
        padx=10,
        pady=5,
        cursor="hand2",
    ).pack(side="left", padx=8)

    tk.Button(
        btn_row,
        text="安全退出",
        command=shutdown_and_quit,
        bg="#F8EAE6",
        fg="#9E4230",
        activebackground="#F1D8D2",
        relief="flat",
        font=("Microsoft YaHei UI", 9),
        padx=10,
        pady=6,
        cursor="hand2",
    ).pack(side="right")

    root.update_idletasks()
    win_w = max(410, root.winfo_reqwidth())
    win_h = max(210, root.winfo_reqheight())
    sx = max(0, (root.winfo_screenwidth() - win_w) // 2)
    sy = max(0, (root.winfo_screenheight() - win_h) // 2)
    root.geometry(f"{win_w}x{win_h}+{sx}+{sy}")

    root.protocol("WM_DELETE_WINDOW", shutdown_and_quit)
    root.mainloop()
    return True


def run_smoke_test(server: LocalWorkbenchServer, url: str) -> None:
    import re
    import urllib.request
    srv_thread = threading.Thread(target=server.serve_forever, daemon=True)
    srv_thread.start()
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f"{url}/", timeout=3) as r1:
            assert r1.status == 200, f"GET / returned {r1.status}"
            html = r1.read().decode("utf-8")
        # Verify Vite compiled JS/CSS assets & at least one local woff2 font are served cleanly
        assets = re.findall(r'(/static/assets/[^"\']+)', html)
        assert len(assets) >= 2, f"Expected bundled JS & CSS assets in index.html, got: {assets}"
        for rel_url in assets:
            with opener.open(f"{url}{rel_url}", timeout=3) as ra:
                assert ra.status == 200, f"GET {rel_url} returned {ra.status}"
        woff2_files = list((STATIC_DIR / "assets").glob("*.woff2"))
        if woff2_files:
            font_url = f"/static/assets/{woff2_files[0].name}"
            with opener.open(f"{url}{font_url}", timeout=3) as rf:
                assert rf.status == 200, f"GET {font_url} returned {rf.status}"
                ctype = rf.headers.get("Content-Type", "")
                assert "font/woff2" in ctype, f"Unexpected woff2 Content-Type: {ctype}"
        with opener.open(f"{url}/api/bootstrap", timeout=5) as r2:
            payload = json.loads(r2.read().decode("utf-8"))
            assert payload.get("ok") is True, f"bootstrap failed: {payload}"
            ai_cfg = payload.get("config", {}).get("ai_config", {})
            assert "provider" in ai_cfg, f"missing ai_config in bootstrap: {ai_cfg}"
            print(
                f"EXE_SMOKE_TEST_OK professors={len(payload.get('professors', []))} "
                f"assets={len(assets)} woff2={len(woff2_files)} ai_provider={ai_cfg.get('provider')}"
            )
    finally:
        server.shutdown()
        server.server_close()


def main():
    ensure_stdio()
    os.chdir(BASE_DIR)

    base_port = int(os.environ.get("WORKBENCH_PORT", "8765"))
    no_browser = "--no-browser" in sys.argv
    smoke_test = "--smoke-test" in sys.argv
    use_gui = ("--gui" in sys.argv) or (IS_FROZEN and "--cli" not in sys.argv and not smoke_test)
    host = "127.0.0.1"
    port = base_port
    server = None

    for candidate in range(base_port, base_port + 20):
        cand_url = f"http://{host}:{candidate}"
        try:
            server = LocalWorkbenchServer((host, candidate), WorkbenchHandler)
            port = candidate
            break
        except OSError:
            if is_workbench_alive(cand_url):
                print(f"=======================================================")
                print(f"  套磁工作台已在后台运行：{cand_url}")
                print(f"=======================================================")
                if not no_browser:
                    webbrowser.open(cand_url)
                return

    if server is None:
        err_msg = f"端口 {base_port}~{base_port + 19} 均被占用，无法启动服务"
        if use_gui:
            try:
                import tkinter as tk
                from tkinter import messagebox
                r = tk.Tk()
                r.withdraw()
                messagebox.showerror("启动失败", err_msg)
                r.destroy()
            except Exception:
                pass
        raise RuntimeError(err_msg)

    url = f"http://{host}:{port}"
    if smoke_test:
        run_smoke_test(server, url)
        return

    if use_gui and run_gui_controller(server, url, no_browser):
        return

    print(f"=======================================================")
    print(f"  PhD_AdvisorContact_System · 申博轻邮工作台已启动")
    print(f"  访问地址：{url}")
    print(f"  保持本窗口开启即可使用；按 Ctrl+C 可安全关闭服务")
    print(f"=======================================================")
    if not no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已关闭。")
        server.server_close()


if __name__ == "__main__":
    main()
