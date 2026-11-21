# PhD_AdvisorContact_System

A clean, local-first academic outreach and lightweight email workbench designed for PhD applicants.

> **Privacy First:** Runs locally on `127.0.0.1`. Personal profiles, mailbox authorization codes, DeepSeek API keys, email threads, resumes, and Excel workbooks stay strictly on the user's own disk.

---

## Core Capabilities

- **Lightweight Single-Mail & Thread Experience**: Freehand compose ("写新邮件"), auto-saved drafts, direct one-click single send, inline reply threading (`Re:` + `In-Reply-To`), and PDF drag-and-drop attachment.
- **Whitelisted IMAP Reply Tracking**: Checks configured mailboxes on startup and periodically in the background—strictly matching contacted advisor addresses and outreach threads while ignoring spam/ads—with real-time new-reply popup alerts.
- **Batched Staggered Dispatch**: Randomized inter-send intervals, domain interleaving across universities, daily quota tracking per mailbox, optional scheduled start time, and IMAP `Drafts` export.
- **DeepSeek BYOK AI Assistant**: Interactive writing/polishing copilot (`"拟定礼貌回信"`, `"起草套磁首信"`, `"精简到 400 字"`, English academic translation) and web faculty directory extraction with match-tier evaluation (`极高匹配` / `高度匹配` / `可以尝试` / `待进一步了解`).
- **Bidirectional Excel Sync**: Reads/writes multi-sheet mentor workbooks (`openpyxl`) and auto-creates a clean starter workbook on first run.
- **Zero-Dependency Windows Portable Packaging**: Compiles frontend assets offline and bundles a standalone Windows `.exe` package via PyInstaller.

---

## Project Structure

```text
PhD_AdvisorContact_System/
├── app.py                  # Python stdlib HTTP/SMTP/IMAP server + openpyxl sync + DeepSeek proxy
├── build_portable.py       # Offline Vite build + PyInstaller --onedir packaging + smoke tests
├── requirements.txt        # Python dependencies (openpyxl, pyinstaller)
└── frontend/               # React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion + Radix UI
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    └── src/
```

---

## Development Setup

### 1. Python Backend

Requires Python 3.10+.

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Frontend Dependencies

Requires Node.js 20+.

```bash
cd frontend
npm install
```

### 3. Run in Development Mode (with Vite HMR)

Terminal 1 (Backend on `127.0.0.1:8765`):

```bash
python app.py --no-browser
```

Terminal 2 (Frontend Dev Server on `http://localhost:5173`):

```bash
cd frontend
npm run dev
```

Or compile static assets into `./static` and serve everything directly from Python:

```bash
cd frontend && npm run build
cd .. && python app.py
```

---

## Build Windows Portable Release

```bash
python build_portable.py
```

This builds `frontend` into `static/`, creates a sanitized portable folder and `.zip` archive under `./release/` (override output path via `WB_RELEASE_ROOT`), runs `套磁工作台.exe --smoke-test`, and validates that no credentials or API keys exist in packaged configs.
