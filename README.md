# PhD_AdvisorContact_System

A local-first, privacy-preserving academic email workbench & advisor management suite built for PhD applicants — packaged as a zero-dependency Windows portable app.

## Key Capabilities

- **Local-First & Zero Cloud Exposure**: Binds strictly to `127.0.0.1`; SMTP/IMAP credentials, DeepSeek API keys, CVs, email threads, and Excel sheets never leave your disk.
- **Editorial Pure-White UI (`frontend/`)**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Radix UI + Motion + Sonner, compiled offline with bundled `@fontsource/inter` and `@fontsource/jetbrains-mono` (zero CDN reliance).
- **Bidirectional Advisor Mail Engine (`app.py`)**:
  - **Single-Message & Threaded Replies**: Compose ad-hoc emails (`QuickComposeModal`), send individual outreach letters directly, auto-save drafts, drag-and-drop PDF CVs, and reply in-thread (`In-Reply-To` / `References`).
  - **Whitelisted IMAP Reply Tracking**: Checks linked mailboxes (`QQ`, `163`, `126`, `.edu`, `Gmail`, custom) exclusively for replies from contacted advisors or matching outreach threads — filtering out spam/ads — with startup and background reply alerts (`ReplyAlertModal`).
  - **Staggered Batch Queue**: Domain-interleaved, daily-quota-balanced batch sending (`DispatchDrawer`) with optional scheduled start times.
- **DeepSeek BYOK Integration**: Built-in AI copilot for drafting, polishing, condensing, English academic translation, reply drafting, and webpage text extraction into structured Excel sheets with match-tier assessment (`极高匹配` / `高度匹配` / `可以尝试` / `待进一步了解`).
- **Live Excel Sync**: Reads and writes multi-sheet `.xlsx` advisor tables cleanly using `openpyxl` with data validation and lock protection.

---

## Project Structure

```text
PhD_AdvisorContact_System/
├── app.py                  # Local HTTP server, IMAP/SMTP engine, DeepSeek BYOK, Excel sync, Tkinter tray window
├── build_portable.py       # One-click frontend build + PyInstaller portable package & smoke tester
├── requirements.txt        # Python dependencies (openpyxl, pyinstaller)
├── frontend/               # React + TypeScript + Vite + Tailwind v4 UI source
│   ├── src/
│   │   ├── App.tsx
│   │   ├── lib/api.ts
│   │   └── components/     # MailStudio, RightSidePanel, ProfessorRail, SettingsDrawer, DispatchDrawer, etc.
│   └── package.json
└── static/                 # Generated offline frontend assets (built via frontend npm run build)
```

---

## Development Setup (For Collaborators)

### 1. Backend Setup (Python 3.10+)

```bash
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run backend server directly (serves compiled ./static + API on http://127.0.0.1:8765)
python app.py
```

### 2. Frontend Development (Node.js 20+)

```bash
cd frontend
npm install

# Live HMR dev server on http://127.0.0.1:5173 (proxies /api -> 127.0.0.1:8765)
npm run dev

# Compile production assets into ../static/
npm run build
```

### 3. Build Standalone Portable Windows Release

From the repository root (with `.venv` activated):

```bash
python build_portable.py
```

Outputs a self-contained portable folder and `.zip` under `./release/` (or override target path with `RELEASE_DIR`), automatically running `--smoke-test` against the frozen executable and verifying clean initial config files.
