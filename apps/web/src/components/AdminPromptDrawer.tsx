import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History,
  KeyRound,
  Lock,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import type { PromptCategory } from "@app/shared";
import {
  adminPromptApi,
  getStoredAdminToken,
  setStoredAdminToken,
} from "@/lib/api.js";
import { cn, formatShortTime } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { ConfirmDialog } from "./ui/BaseDialog.js";
import { BaseSwitch } from "./ui/BaseSwitch.js";
import { Button } from "./ui/Button.js";
import { FamilyDrawer } from "./ui/FamilyDrawer.js";

const CATEGORY_TABS: ReadonlyArray<{ value: "all" | PromptCategory; label: string }> = [
  { value: "all", label: "全部" },
  { value: "copilot", label: "主系统指令" },
  { value: "action", label: "快捷动作" },
  { value: "extractor", label: "网页提取" },
  { value: "analyzer", label: "匹配分析" },
];

/**
 * 管理员专属 Prompt 调优与版本回滚抽屉：
 * 通过 X-Admin-Token 与 cloud-core 通信，支持模板编辑、温度调参、热更新缓存失效与任意历史版本回滚。
 */
export function AdminPromptDrawer() {
  const queryClient = useQueryClient();
  const open = useAppStore((s) => s.adminPromptOpen);
  const setOpen = useAppStore((s) => s.setAdminPromptOpen);

  const [tokenInput, setTokenInput] = useState(() => getStoredAdminToken());
  const [activeToken, setActiveToken] = useState(() => getStoredAdminToken());
  const [verifiedMode, setVerifiedMode] = useState<"env" | "dev-file" | null>(
    null
  );
  const [categoryFilter, setCategoryFilter] = useState<"all" | PromptCategory>(
    "all"
  );
  const [selectedKey, setSelectedKey] = useState<string>("copilot.system");

  // 编辑态字段
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTemp, setEditTemp] = useState(0.45);
  const [editMaxTokens, setEditMaxTokens] = useState(2400);
  const [editEnabled, setEditEnabled] = useState(true);
  const [changeNote, setChangeNote] = useState("");

  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [rollbackTargetVer, setRollbackTargetVer] = useState<number | null>(null);

  const verifyMutation = useMutation({
    mutationFn: (token: string) => adminPromptApi.verify(token),
    onSuccess: (res, token) => {
      const clean = token.trim();
      setStoredAdminToken(clean);
      setActiveToken(clean);
      setVerifiedMode(res.mode);
      toast.success("管理员令牌校验通过");
    },
    onError: (err: Error) => {
      setVerifiedMode(null);
      toast.error(err.message || "管理员令牌无效");
    },
  });

  // 打开抽屉时若 sessionStorage 已有令牌则自动校验一次
  useEffect(() => {
    if (open && activeToken && !verifiedMode) {
      adminPromptApi
        .verify(activeToken)
        .then((res) => setVerifiedMode(res.mode))
        .catch(() => {
          setStoredAdminToken("");
          setActiveToken("");
          setVerifiedMode(null);
        });
    }
  }, [open, activeToken, verifiedMode]);

  const listQuery = useQuery({
    queryKey: ["admin-prompts", activeToken],
    queryFn: () => adminPromptApi.list(activeToken),
    enabled: Boolean(open && verifiedMode && activeToken),
    retry: false,
  });

  const detailQuery = useQuery({
    queryKey: ["admin-prompt-detail", activeToken, selectedKey],
    queryFn: () => adminPromptApi.detail(activeToken, selectedKey),
    enabled: Boolean(open && verifiedMode && activeToken && selectedKey),
    retry: false,
  });

  useEffect(() => {
    const p = detailQuery.data?.prompt;
    if (!p) return;
    setEditName(p.name);
    setEditDescription(p.description);
    setEditContent(p.content);
    setEditTemp(p.temperature);
    setEditMaxTokens(p.maxOutputTokens);
    setEditEnabled(p.isEnabled);
    setChangeNote("");
  }, [detailQuery.data?.prompt]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminPromptApi.update(activeToken, selectedKey, {
        name: editName.trim() || undefined,
        description: editDescription.trim(),
        content: editContent,
        temperature: Number(editTemp),
        maxOutputTokens: Number(editMaxTokens),
        isEnabled: editEnabled,
        changeNote: changeNote.trim() || "管理员后台调优",
      }),
    onSuccess: async (res) => {
      queryClient.setQueryData(
        ["admin-prompt-detail", activeToken, selectedKey],
        { ...res, defaultContentAvailable: true }
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-prompts"] });
      setChangeNote("");
      toast.success(
        `已发布新版本 v${res.prompt.activeVersion}，cloud-core 缓存已即时刷新`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetMutation = useMutation({
    mutationFn: () => adminPromptApi.resetDefault(activeToken, selectedKey),
    onSuccess: async (res) => {
      setConfirmResetOpen(false);
      queryClient.setQueryData(
        ["admin-prompt-detail", activeToken, selectedKey],
        { ...res, defaultContentAvailable: true }
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-prompts"] });
      toast.success(`已恢复出厂默认版本 (v${res.prompt.activeVersion})`);
    },
    onError: (err: Error) => {
      setConfirmResetOpen(false);
      toast.error(err.message);
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (version: number) =>
      adminPromptApi.rollback(activeToken, selectedKey, version),
    onSuccess: async (res) => {
      setRollbackTargetVer(null);
      queryClient.setQueryData(
        ["admin-prompt-detail", activeToken, selectedKey],
        { ...res, defaultContentAvailable: true }
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-prompts"] });
      toast.success(
        `已回滚至 v${res.restoredFromVersion} 的内容（当前为 v${res.prompt.activeVersion}）`
      );
    },
    onError: (err: Error) => {
      setRollbackTargetVer(null);
      toast.error(err.message);
    },
  });

  const filteredPrompts = useMemo(() => {
    const items = listQuery.data?.prompts || [];
    if (categoryFilter === "all") return items;
    return items.filter((item) => item.category === categoryFilter);
  }, [listQuery.data, categoryFilter]);

  function lockConsole() {
    setStoredAdminToken("");
    setActiveToken("");
    setTokenInput("");
    setVerifiedMode(null);
    toast.info("已锁定并清除会话中的管理员令牌");
  }

  return (
    <FamilyDrawer
      open={open}
      onOpenChange={setOpen}
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
          <span>管理员 Prompt 调优控制台</span>
        </span>
      }
      description="仅限管理员权限管理与发布核心系统 Prompt；所有修改即时生效于 AI 调用链路"
      widthClass="w-full max-w-[940px]"
      headerExtra={
        verifiedMode ? (
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
              {verifiedMode === "env" ? "环境变量管理员模式" : "本地开发令牌模式"}
            </span>
            <Button
              variant="ghost"
              size="xs"
              icon={<Lock className="w-3 h-3" />}
              onClick={lockConsole}
            >
              锁定退出
            </Button>
          </div>
        ) : null
      }
    >
      {!verifiedMode ? (
        <div className="max-w-md mx-auto py-12 space-y-4">
          <div className="tactile-card rounded-3xl p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#2563EB] inline-flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-[16px] font-semibold text-[#111827]">
                需要管理员身份验证
              </h3>
              <p className="text-[12px] text-slate-500 leading-relaxed">
                核心 Prompt 资产受服务端 <code className="font-mono">requireAdmin</code> 中间件保护。本地开发可查看{" "}
                <code className="font-mono text-[#2563EB]">storage/.dev-admin.token</code> 获取令牌，生产环境对应{" "}
                <code className="font-mono">ADMIN_API_TOKEN</code>。
              </p>
            </div>

            <form
              className="space-y-3 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                if (!tokenInput.trim()) return;
                verifyMutation.mutate(tokenInput);
              }}
            >
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="输入 X-Admin-Token 密钥..."
                className="w-full h-10 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-[12px] focus:outline-none focus:bg-white focus:border-[#2563EB]"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={verifyMutation.isPending}
                disabled={!tokenInput.trim()}
                icon={<Unlock className="w-4 h-4" />}
                className="w-full"
              >
                验证并解锁控制台
              </Button>
            </form>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-slate-400 px-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-slate-400" />
            <span>
              令牌仅暂存于当前标签页 sessionStorage，关闭窗口或点击右上角「锁定退出」后立即销毁。
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr] gap-4 items-start">
          {/* 左列：Prompt 分类与模板清单 */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1">
              {CATEGORY_TABS.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategoryFilter(cat.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors",
                    categoryFilter === cat.value
                      ? "bg-[#2563EB] text-white border-[#2563EB]"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 max-h-[68vh] overflow-y-auto pr-1">
              {filteredPrompts.map((item) => {
                const active = item.key === selectedKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedKey(item.key)}
                    className={cn(
                      "w-full text-left p-2.5 rounded-2xl border transition-all cursor-pointer space-y-1",
                      active
                        ? "bg-white border-[#2563EB]/50 glow-electric-soft"
                        : "bg-white/75 border-slate-200/80 hover:bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-[#111827] truncate">
                        {item.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-mono text-slate-600 shrink-0">
                        v{item.activeVersion}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="font-mono text-slate-400 truncate">
                        {item.key}
                      </span>
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          item.isEnabled ? "bg-emerald-500" : "bg-amber-400"
                        )}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右列：Prompt 编辑区 + 修订版本历史 */}
          <div className="space-y-4">
            {detailQuery.data?.prompt ? (
              <>
                <div className="tactile-card rounded-2xl p-4 space-y-3 text-[12px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-lg bg-blue-50 text-[#2563EB] border border-blue-200/70">
                        {detailQuery.data.prompt.key}
                      </span>
                      <span className="ml-2 text-[11px] text-slate-400">
                        当前激活 v{detailQuery.data.prompt.activeVersion} · 更新于{" "}
                        {formatShortTime(detailQuery.data.prompt.updatedAt)}
                      </span>
                    </div>
                    <BaseSwitch
                      checked={editEnabled}
                      label={editEnabled ? "已启用热生效" : "已停用（将回落出厂默认）"}
                      onCheckedChange={setEditEnabled}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-500">展示名称</label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-slate-500">Temperature (0~2)</label>
                        <input
                          type="number"
                          step="0.05"
                          min={0}
                          max={2}
                          value={editTemp}
                          onChange={(e) => setEditTemp(Number(e.target.value))}
                          className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-500">Max Output Tokens</label>
                        <input
                          type="number"
                          step={64}
                          min={64}
                          max={16384}
                          value={editMaxTokens}
                          onChange={(e) =>
                            setEditMaxTokens(Number(e.target.value))
                          }
                          className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-500">用途说明</label>
                    <input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-500">
                      Prompt 正文模板（支持 {"{{variable}}"} 占位符）
                    </label>
                    <textarea
                      rows={9}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="mt-1 w-full p-3 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white font-mono text-[12px] leading-relaxed focus:outline-none focus:border-[#2563EB]/50"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={changeNote}
                      onChange={(e) => setChangeNote(e.target.value)}
                      placeholder="填写本次调优说明（选填，将记录在版本日志中）..."
                      className="flex-1 min-w-[200px] h-8 px-3 rounded-xl border border-slate-200 bg-white"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<RotateCcw className="w-3.5 h-3.5" />}
                      onClick={() => setConfirmResetOpen(true)}
                    >
                      恢复默认
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={saveMutation.isPending}
                      icon={<Save className="w-3.5 h-3.5" />}
                      onClick={() => saveMutation.mutate()}
                    >
                      发布新版本并热生效
                    </Button>
                  </div>
                </div>

                {/* 版本修订历史 */}
                <div className="tactile-card rounded-2xl p-4 space-y-2.5 text-[12px]">
                  <div className="flex items-center gap-2 font-semibold text-[#111827]">
                    <History className="w-4 h-4 text-[#2563EB]" />
                    <span>修订版本记录 ({detailQuery.data.revisions.length})</span>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {detailQuery.data.revisions.map((rev) => {
                      const isCurrent =
                        rev.version === detailQuery.data?.prompt.activeVersion;
                      return (
                        <div
                          key={rev.id}
                          className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-[#111827]">
                                v{rev.version}
                              </span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  当前激活
                                </span>
                              )}
                              <span className="text-slate-600 truncate">
                                {rev.changeNote || "无说明"}
                              </span>
                            </div>
                            <div className="text-[10.5px] text-slate-400 font-mono">
                              {rev.createdBy} · {formatShortTime(rev.createdAt)} ·
                              temp={rev.temperature} · max={rev.maxOutputTokens}
                            </div>
                          </div>
                          {!isCurrent && (
                            <Button
                              variant="glass"
                              size="xs"
                              onClick={() => setRollbackTargetVer(rev.version)}
                            >
                              回滚到此版
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-10 text-center text-[12px] text-slate-400">
                正在加载模板详情...
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        title="恢复为系统出厂默认 Prompt？"
        description={`将把「${selectedKey}」重置为内置默认文案与默认温度参数，并作为一条新版本号记入修订历史。`}
        confirmLabel="确认恢复默认"
        loading={resetMutation.isPending}
        onConfirm={() => resetMutation.mutate()}
      />

      <ConfirmDialog
        open={rollbackTargetVer !== null}
        onOpenChange={(v) => {
          if (!v) setRollbackTargetVer(null);
        }}
        title={`回滚至历史版本 v${rollbackTargetVer ?? ""}？`}
        description="系统将提取该历史快照的文本与参数发布为最新激活版本，并立即清除服务端缓存。"
        confirmLabel="确认回滚"
        loading={rollbackMutation.isPending}
        onConfirm={() => {
          if (rollbackTargetVer !== null) {
            rollbackMutation.mutate(rollbackTargetVer);
          }
        }}
      />
    </FamilyDrawer>
  );
}
