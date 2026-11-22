import React, { useEffect, useState } from "react";
import { Sparkles, Check, Plus, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, ModalDialog, SelectBox } from "./ui";
import { apiFetch, cn, MATCH_OPTIONS, normalizeMatchTier } from "../lib/api";
import type { ExtractedProfessor } from "../types";

const MODAL_INPUT_CLS =
  "w-full h-8.5 px-3 bg-white ring-1 ring-slate-900/[0.1] rounded-[9px] text-[12.5px] text-[#18181B] placeholder:text-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all";

export function AiImportModal({
  open,
  onOpenChange,
  sheets,
  hasAiKey,
  initialSchool,
  initialPageUrl,
  onOpenAiSettings,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sheets: string[];
  hasAiKey: boolean;
  initialSchool?: string;
  initialPageUrl?: string;
  onOpenAiSettings: () => void;
  onImported: () => Promise<void>;
}) {
  const [step, setStep] = useState<"input" | "preview">("input");
  const [school, setSchool] = useState(initialSchool || sheets[0] || "目标高校");
  const [pageUrl, setPageUrl] = useState(initialPageUrl || "");
  const [rawText, setRawText] = useState("");
  const [fetchingPage, setFetchingPage] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<ExtractedProfessor[]>([]);

  useEffect(() => {
    if (open) {
      if (initialSchool) setSchool(initialSchool);
      if (initialPageUrl !== undefined) setPageUrl(initialPageUrl);
    }
  }, [open, initialSchool, initialPageUrl]);

  async function handleFetchPagePreview() {
    if (!pageUrl.trim()) {
      toast.warning("请先填写学院官网或师资列表网址");
      return;
    }
    setFetchingPage(true);
    try {
      const res = await apiFetch<{ text: string; url: string }>("/api/universities/fetch_page_text", "POST", {
        url: pageUrl.trim(),
      });
      if (!res.text?.trim()) {
        toast.warning("网页正文较少（可能是纯图片或动态加载），建议点击打开网页手动全选复制");
      } else {
        setRawText(res.text);
        toast.success(`已读取网页文字（${res.text.length} 字），可直接点击「开始智能提取」`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setFetchingPage(false);
    }
  }

  async function handleExtract() {
    if (!hasAiKey) {
      toast.warning("请先填写您的 DeepSeek API Key");
      onOpenChange(false);
      onOpenAiSettings();
      return;
    }
    if (!rawText.trim() && !pageUrl.trim()) {
      toast.warning("请粘贴院系师资网页文字，或输入公开页面网址");
      return;
    }
    setExtracting(true);
    try {
      const res = await apiFetch<{ professors: any[] }>("/api/ai/extract_professors", "POST", {
        school,
        raw_text: rawText,
        page_url: pageUrl,
      });
      if (!res.professors || res.professors.length === 0) {
        toast.warning("未能识别出导师信息，建议直接打开网页全选文字粘贴后再试");
        return;
      }
      setRows(
        res.professors.map((p) => ({
          selected: true,
          name: p.name || "",
          dept: p.dept || "",
          title: p.title || "",
          tags: p.tags || "",
          research: p.research || "",
          email: p.email || "",
          homepage: p.homepage || "",
          priority: normalizeMatchTier(p.priority || "高度匹配"),
          note: p.note || "",
        }))
      );
      setStep("preview");
      toast.success(`已识别 ${res.professors.length} 位导师并完成匹配度初评`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleConfirmImport() {
    const picked = rows.filter((r) => r.selected && r.name.trim());
    if (picked.length === 0) {
      toast.warning("请至少勾选一位导师");
      return;
    }
    setImporting(true);
    try {
      const res = await apiFetch<{ added: number; skipped: number; sheet: string }>(
        "/api/professors/import",
        "POST",
        { school, professors: picked }
      );
      toast.success(`已导入 ${res.added} 位导师至「${res.sheet}」（跳过重复 ${res.skipped} 位）`);
      await onImported();
      onOpenChange(false);
      setStep("input");
      setRawText("");
      setPageUrl("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <ModalDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setStep("input");
      }}
      title={step === "input" ? "AI 识别网页导入导师 & 评估匹配度" : "核对识别结果并写入表格"}
      maxWidth={step === "input" ? "max-w-[610px]" : "max-w-[850px]"}
      footer={
        step === "input" ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button variant="primary" loading={extracting} onClick={handleExtract}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>开始智能提取</span>
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep("input")}>
              返回修改
            </Button>
            <Button variant="primary" loading={importing} onClick={handleConfirmImport}>
              <Check className="w-3.5 h-3.5" />
              <span>导入所选导师（{rows.filter((r) => r.selected).length} 位）</span>
            </Button>
          </>
        )
      }
    >
      {step === "input" ? (
        <div className="space-y-3.5">
          <div className="p-3.5 rounded-[12px] bg-[#EFF6FF]/65 ring-1 ring-[#3B82F6]/15 text-[12.5px] text-[#3F3F46] leading-relaxed">
            打开目标学院官网的“师资队伍”页面，全选复制页面文字粘贴到下方，DeepSeek 会自动提取姓名、邮箱、方向，并结合你的学术名片给出<strong>匹配度建议</strong>（绝不编造不存在的邮箱）。
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">归属高校（自动建分页）</label>
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="例如：复旦大学"
                className={MODAL_INPUT_CLS}
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">或填写公开师资页网址（支持自动读正文）</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={pageUrl}
                  onChange={(e) => setPageUrl(e.target.value)}
                  placeholder="https://..."
                  className={cn(MODAL_INPUT_CLS, "font-mono text-[12px] flex-1 min-w-0")}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={fetchingPage || !pageUrl.trim()}
                  onClick={handleFetchPagePreview}
                  title="自动抓取该页面正文填充到下方预览框"
                  className="h-8.5 px-2.5 shrink-0"
                >
                  {fetchingPage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5 text-[#2563EB]" />}
                  <span>读网页</span>
                </Button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">
              粘贴学院师资网页文字（推荐直接复制粘贴，识别最稳）
            </label>
            <textarea
              rows={8}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="在此粘贴导师列表或某位导师的主页简介文字..."
              className="w-full p-3 bg-white ring-1 ring-slate-900/[0.1] rounded-[11px] text-[12.5px] leading-relaxed text-[#18181B] placeholder:text-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#2563EB]/20 resize-y transition-all"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[12.5px] text-[#52525B]">
            即将写入 <strong className="text-[#18181B]">{school}</strong>，你可以微调匹配度或邮箱后再导入：
          </div>
          <div className="max-h-[380px] overflow-y-auto ring-1 ring-slate-900/[0.08] rounded-[11px]">
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-[#F8F9FB] text-[#71717A]">
                <tr>
                  <th className="px-2.5 py-2 border-b border-slate-900/[0.06] w-10 text-center font-medium">选</th>
                  <th className="px-2.5 py-2 border-b border-slate-900/[0.06] text-left w-24 font-medium">姓名</th>
                  <th className="px-2.5 py-2 border-b border-slate-900/[0.06] text-left w-36 font-medium">院系 / 职称</th>
                  <th className="px-2.5 py-2 border-b border-slate-900/[0.06] text-left w-44 font-medium">邮箱</th>
                  <th className="px-2.5 py-2 border-b border-slate-900/[0.06] text-left font-medium">研究方向</th>
                  <th className="px-2.5 py-2 border-b border-slate-900/[0.06] text-left w-32 font-medium">匹配度</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-b border-slate-900/[0.05] last:border-b-0 hover:bg-[#F8F9FB]/70">
                    <td className="px-2.5 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, selected: e.target.checked } : x))
                          )
                        }
                        className="accent-[#18181B] cursor-pointer"
                      />
                    </td>
                    <td className="px-2.5 py-2 font-semibold text-[#18181B]">{r.name}</td>
                    <td className="px-2.5 py-2 text-[#52525B]">
                      <div>{r.dept || "—"}</div>
                      <div className="text-[11px] text-[#71717A]">{r.title}</div>
                    </td>
                    <td className="px-2.5 py-2">
                      <input
                        type="text"
                        value={r.email}
                        placeholder="待补充"
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, email: e.target.value } : x))
                          )
                        }
                        className="w-full h-7 px-2 bg-white ring-1 ring-slate-900/[0.08] rounded-[6px] font-mono text-[11.5px] outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </td>
                    <td className="px-2.5 py-2 text-[#52525B] text-[11.5px]">{r.research || r.tags}</td>
                    <td className="px-2.5 py-2">
                      <SelectBox
                        variant="mini"
                        value={r.priority}
                        onValueChange={(v) =>
                          setRows((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, priority: v } : x))
                          )
                        }
                        options={MATCH_OPTIONS.map((o) => ({ value: o.value, label: o.short }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ModalDialog>
  );
}

export function QuickAddProfModal({
  open,
  onOpenChange,
  sheets,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sheets: string[];
  onCreated: () => Promise<void>;
}) {
  const [sheet, setSheet] = useState(sheets[0] || "目标高校");
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [title, setTitle] = useState("教授 / 博导");
  const [email, setEmail] = useState("");
  const [tags, setTags] = useState("");
  const [research, setResearch] = useState("");
  const [priority, setPriority] = useState("高度匹配");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      toast.warning("请填写导师姓名");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/professor/create", "POST", {
        sheet,
        name,
        dept,
        title,
        email,
        tags,
        research,
        priority,
        in_batch: true,
        status: "待撰写",
      });
      toast.success(`已添加导师「${name}」`);
      await onCreated();
      onOpenChange(false);
      setName("");
      setEmail("");
      setTags("");
      setResearch("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="手动添加一位导师"
      maxWidth="max-w-[540px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" loading={saving} onClick={handleSubmit}>
            <Plus className="w-3.5 h-3.5" />
            <span>添加到名录</span>
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">所属高校</label>
          <input
            type="text"
            value={sheet}
            onChange={(e) => setSheet(e.target.value)}
            placeholder="新高校会自动新建分页"
            className={MODAL_INPUT_CLS}
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">导师姓名 *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：林清韵"
            className={MODAL_INPUT_CLS}
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">学院 / 系所</label>
          <input
            type="text"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className={MODAL_INPUT_CLS}
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">职称</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={MODAL_INPUT_CLS}
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">公开邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prof@university.edu.cn"
            className={cn(MODAL_INPUT_CLS, "font-mono text-[12px]")}
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">匹配度</label>
          <SelectBox
            variant="form"
            value={priority}
            onValueChange={setPriority}
            options={MATCH_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">研究关键词（用 | 分隔）</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="例如：媒介文化 | 城市记忆"
            className={MODAL_INPUT_CLS}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">详细研究方向</label>
          <textarea
            rows={2}
            value={research}
            onChange={(e) => setResearch(e.target.value)}
            className="w-full p-2.5 bg-white ring-1 ring-slate-900/[0.1] rounded-[9px] text-[12.5px] outline-none focus:ring-2 focus:ring-[#2563EB]/20 resize-y transition-all"
          />
        </div>
      </div>
    </ModalDialog>
  );
}
