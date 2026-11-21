# -*- coding: utf-8 -*-
"""
Builds a standalone, zero-dependency Windows portable distribution under ./release/
(or RELEASE_DIR if specified via environment variable).

Includes:
- Vite + React + Tailwind v4 compiled static bundle (no Node/CDN runtime needed)
- DeepSeek BYOK AI copilot, bidirectional IMAP/SMTP mail engine & Excel sync backend
- Clean starter Excel workbook, sanitized config.json, PDF uploads dir, and quickstart guide
- Automated frozen .exe --smoke-test & config sanitization check prior to zipping
"""

import json
import os
import shutil
import struct
import subprocess
import sys
import zipfile
import zlib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
STATIC_DIR = BASE_DIR / "static"
BUILD_TMP = BASE_DIR / "_pyinstaller_build"
DEFAULT_OUTPUT = BASE_DIR / "release"
RELEASE_ROOT = Path(os.environ.get("RELEASE_DIR") or DEFAULT_OUTPUT)
PKG_NAME = "套磁工作台"
DIST_FOLDER = RELEASE_ROOT / f"{PKG_NAME}_便携版"
ZIP_PATH = RELEASE_ROOT / f"{PKG_NAME}_便携版.zip"

EXTRA_PRIVACY_TOKENS = [
    tok.strip()
    for tok in os.environ.get("PRIVACY_TOKENS", "").split(",")
    if tok.strip()
]


def make_png_bytes(width: int, height: int, rgba_rows: list) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = b"".join(b"\x00" + bytes(row) for row in rgba_rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def create_app_icon(ico_path: Path) -> None:
    """Generates a crisp 64x64 Warm Paper & Deep Pine envelope icon (.ico with embedded PNG)."""
    w = h = 64
    rows = []
    bg = (31, 59, 52, 255)        # #1F3B34 Deep Pine
    paper = (245, 243, 238, 255)  # #F5F3EE Warm Paper
    accent = (184, 206, 197, 255) # #B8CEC5 Pine Line
    trans = (0, 0, 0, 0)

    cx = cy = 31.5
    r_corner = 14.0

    for y in range(h):
        row = bytearray()
        for x in range(w):
            dx = max(0.0, abs(x - cx) - (31.5 - r_corner))
            dy = max(0.0, abs(y - cy) - (31.5 - r_corner))
            if (dx * dx + dy * dy) > (r_corner * r_corner):
                row.extend(trans)
                continue

            in_env = (13 <= x <= 50) and (20 <= y <= 44)
            if not in_env:
                row.extend(bg)
                continue

            v_y = 21.0 + abs(x - 31.5) * 0.68
            if abs(y - v_y) <= 1.25 and y <= 35:
                row.extend(bg)
            elif abs(y - v_y) <= 2.1 and y <= 35:
                row.extend(accent)
            else:
                row.extend(paper)
        rows.append(row)

    png_data = make_png_bytes(w, h, rows)
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(png_data), 6 + 16)
    ico_path.parent.mkdir(parents=True, exist_ok=True)
    ico_path.write_bytes(header + entry + png_data)


def write_quickstart_txt(dest: Path) -> None:
    content = """========================================================
  申博轻邮 · 学术套磁与通信工作台（免安装便携版）
========================================================

【核心亮点】
1. 免安装即点即用：已内置全部运行环境与静态界面，解压到任意文件夹即可使用。
2. 隐私完全本地化：所有邮箱授权码、DeepSeek API Key、邮件往来、简历 PDF 与
   Excel 表格均保存在您自己的电脑硬盘上，绝不上传至任何第三方服务器。
3. 日常单封收发 + 批量错峰双模式：既可以像普通邮箱一样随时写新邮件、单封直发、
   自动查收联系过导师的回信并弹窗提醒、直接在会话里回复，也可以攒好几封一起错峰批量发出。
4. 内置 DeepSeek AI 助手：自备官方 API Key 即可帮写套磁信、拟定礼貌回信，或粘贴学院
   师资网页文字一键提取导师并评估“匹配度”。

【首次使用 4 步上手】
第 1 步：双击运行「套磁工作台.exe」（如遇系统提示，允许运行即可）
        浏览器会自动打开工作台界面；同时桌面会出现一个小巧的本地控制窗。
        （使用时请保留控制窗开启；用完点击“安全退出”或直接关闭控制窗即可）

第 2 步：填写个人名片、收发邮箱与 AI 助手
        点击右上角「设置」：
        - 【我的名片与简历】：填写姓名、学校、科研经历摘要，直接上传 PDF 简历
        - 【收发邮箱】：点选 QQ / 163 / 高校邮箱，填入邮箱地址与客户端授权码，点击测试连接并保存
        - 【DeepSeek AI】：填入 API Key 测试保存（可选，用于 AI 帮写、拟回信与导表评匹配度）

第 3 步：建立或导入导师名录
        方式 A：点左侧「AI 导表」，粘贴学院官网师资列表文字一键识别并生成匹配度
        方式 B：点左侧「+」手动添加，或直接编辑本目录下的「博导信息与套磁管理表.xlsx」

第 4 步：写信、发送与接收回信
        - 在主界面写完一封信会自动保存，可直接点「立即发送这一封」，也可点右上角「写新邮件」随时发给任何人
        - 每次打开软件都会自动查收联系过导师的新回信（屏蔽垃圾广告），有新回信会立刻弹出小信鸽提醒卡片
        - 攒了多封「待发送」信件时，点右上角「批量发送」自动错峰投递
"""
    dest.write_text(content, encoding="utf-8")


def build_frontend() -> None:
    if "--skip-frontend" in sys.argv:
        if not (STATIC_DIR / "index.html").is_file():
            raise RuntimeError("Missing static/index.html while --skip-frontend was set")
        print("[0/5] Skipping frontend build (--skip-frontend); using existing static/")
        return

    npm_bin = "npm.cmd" if os.name == "nt" else "npm"
    print("[0/5] Building React + Tailwind frontend bundle...")
    subprocess.run([npm_bin, "run", "build"], cwd=str(FRONTEND_DIR), check=True)
    if not (STATIC_DIR / "index.html").is_file():
        raise RuntimeError(f"Expected compiled static/index.html missing under {STATIC_DIR}")


def scan_privacy(dist_dir: Path) -> None:
    """Verifies released config files contain zero pre-filled credentials or personal info."""
    for cfg_name in ("config.json", "config.example.json"):
        cfg_file = dist_dir / cfg_name
        if not cfg_file.is_file():
            raise RuntimeError(f"Missing release config: {cfg_file}")
        data = json.loads(cfg_file.read_text(encoding="utf-8"))
        sp = data.get("sender_profile", {})
        if any((sp.get(k) or "").strip() for k in ("name", "phone", "wechat", "affiliation", "research_summary")):
            raise RuntimeError(f"Non-empty sender_profile found in {cfg_name}")
        if (data.get("ai_config", {}).get("api_key") or "").strip():
            raise RuntimeError(f"Non-empty AI api_key found in {cfg_name}")
        for acc in data.get("accounts", []):
            if (acc.get("email") or "").strip() or (acc.get("password") or "").strip():
                raise RuntimeError(f"Non-empty mailbox credential found in {cfg_name}")

    if not EXTRA_PRIVACY_TOKENS:
        return
    hits = []
    scan_exts = {".json", ".txt", ".html", ".js", ".css", ".py"}
    for p in dist_dir.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in scan_exts and p.name != "博导信息与套磁管理表.xlsx":
            continue
        if p.suffix.lower() == ".xlsx":
            try:
                import openpyxl
                wb = openpyxl.load_workbook(p, data_only=True)
                chunks = []
                for sname in wb.sheetnames:
                    chunks.append(sname)
                    ws = wb[sname]
                    for row in ws.iter_rows(values_only=True):
                        for cell in row:
                            if cell is not None:
                                chunks.append(str(cell))
                text = "\n".join(chunks)
            except Exception:
                text = ""
        else:
            try:
                text = p.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
        for tok in EXTRA_PRIVACY_TOKENS:
            if tok in text:
                hits.append((str(p.relative_to(dist_dir)), tok))
    if hits:
        raise RuntimeError(f"Privacy leakage detected in release folder: {hits}")


def main():
    sys.path.insert(0, str(BASE_DIR))
    import app as wb_app

    build_frontend()

    if BUILD_TMP.exists():
        shutil.rmtree(BUILD_TMP)
    BUILD_TMP.mkdir(parents=True, exist_ok=True)

    ico_path = BUILD_TMP / "app.ico"
    create_app_icon(ico_path)

    dist_tmp = BUILD_TMP / "dist"
    work_tmp = BUILD_TMP / "work"

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--noconsole",
        "--name",
        PKG_NAME,
        "--icon",
        str(ico_path),
        "--distpath",
        str(dist_tmp),
        "--workpath",
        str(work_tmp),
        "--specpath",
        str(BUILD_TMP),
        "--add-data",
        f"{STATIC_DIR};static",
        "--hidden-import",
        "openpyxl",
        "--hidden-import",
        "et_xmlfile",
        "--hidden-import",
        "tkinter",
        "--hidden-import",
        "tkinter.messagebox",
        str(BASE_DIR / "app.py"),
    ]

    print("[1/5] Running PyInstaller build...")
    subprocess.run(cmd, cwd=str(BASE_DIR), check=True)

    built_dir = dist_tmp / PKG_NAME
    if not built_dir.is_dir():
        raise RuntimeError(f"Expected PyInstaller output not found: {built_dir}")

    print("[2/5] Assembling sanitized portable folder...")
    RELEASE_ROOT.mkdir(parents=True, exist_ok=True)
    if DIST_FOLDER.exists():
        shutil.rmtree(DIST_FOLDER)
    shutil.copytree(built_dir, DIST_FOLDER)

    blank_cfg = wb_app.build_blank_config()
    blank_json = json.dumps(blank_cfg, ensure_ascii=False, indent=2)
    (DIST_FOLDER / "config.json").write_text(blank_json, encoding="utf-8")
    (DIST_FOLDER / "config.example.json").write_text(blank_json, encoding="utf-8")
    (DIST_FOLDER / "resumes").mkdir(exist_ok=True)
    (DIST_FOLDER / "outbox").mkdir(exist_ok=True)
    (DIST_FOLDER / "logs").mkdir(exist_ok=True)
    wb_app.create_starter_excel(DIST_FOLDER / "博导信息与套磁管理表.xlsx")
    write_quickstart_txt(DIST_FOLDER / "使用说明.txt")

    exe_path = DIST_FOLDER / f"{PKG_NAME}.exe"
    print(f"[3/5] Running frozen executable smoke test: {exe_path}")
    env = dict(os.environ)
    env["WORKBENCH_PORT"] = "8798"
    res = subprocess.run(
        [str(exe_path), "--smoke-test"],
        cwd=str(DIST_FOLDER),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
    )
    if res.returncode != 0:
        raise RuntimeError(
            f"Smoke test failed (code {res.returncode}):\nSTDOUT:{res.stdout}\nSTDERR:{res.stderr}"
        )

    smoke_log = DIST_FOLDER / "logs" / "workbench.log"
    smoke_text = (res.stdout or "").strip()
    if smoke_log.exists():
        smoke_text = (smoke_text + "\n" + smoke_log.read_text(encoding="utf-8", errors="replace")).strip()
        smoke_log.unlink()
    print("Smoke output:", smoke_text)
    if "EXE_SMOKE_TEST_OK" not in smoke_text:
        raise RuntimeError(f"EXE_SMOKE_TEST_OK marker missing from smoke output: {smoke_text}")

    print("[4/5] Running release privacy leakage scan...")
    scan_privacy(DIST_FOLDER)
    print("Privacy scan passed: 0 hits across release artifacts.")

    print(f"[5/5] Compressing portable archive -> {ZIP_PATH}")
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for item in sorted(DIST_FOLDER.rglob("*")):
            arcname = Path(DIST_FOLDER.name) / item.relative_to(DIST_FOLDER)
            if item.is_dir():
                if not any(item.iterdir()):
                    zf.write(item, arcname)
            else:
                zf.write(item, arcname)

    shutil.rmtree(BUILD_TMP, ignore_errors=True)
    zip_mb = ZIP_PATH.stat().st_size / (1024 * 1024)
    print(f"BUILD_COMPLETE: folder={DIST_FOLDER} zip={ZIP_PATH} ({zip_mb:.2f} MB)")


if __name__ == "__main__":
    main()
