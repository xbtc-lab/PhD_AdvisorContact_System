import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { opsApi } from "@/lib/ops-api.js";

export function OpsLoginScreen({
  devTokenHint,
  onSuccess,
}: {
  devTokenHint?: string;
  onSuccess: () => void;
}) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    try {
      await opsApi.login(token.trim());
      toast.success("已通过管理端安全校验");
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F8F8FA]">
      <div className="ops-card w-full max-w-md p-7 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#141417] text-white flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-[#FF5C35]" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-[#0F172A] tracking-tight">
              PhD Cue Ops Console
            </h1>
            <p className="text-[12px] text-[#64748B]">
              独立采集控制面与公共博导库治理台
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[12.5px] font-medium text-[#334155]">
              管理员访问令牌 (`ADMIN_API_TOKEN`)
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="输入管理员令牌建立 HttpOnly 会话..."
                className="w-full h-10 pl-10 pr-3 rounded-xl border border-[#E5E7EB] text-[13px] focus:outline-none focus:border-[#141417]"
                autoFocus
              />
            </div>
            {devTokenHint && (
              <p className="text-[11.5px] text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
                本地开发模式：令牌已持久化在工作区{" "}
                <code className="ops-mono text-[#0F172A]">{devTokenHint}</code>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="w-full h-10 rounded-xl bg-[#141417] hover:bg-[#27272A] disabled:opacity-50 text-white text-[13px] font-medium cursor-pointer transition-colors"
          >
            {loading ? "正在验证..." : "进入运营管理台"}
          </button>
        </form>
      </div>
    </div>
  );
}
