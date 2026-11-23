import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { opsApi } from "@/lib/ops-api.js";
import { OpsLayout, type OpsNavKey } from "@/components/OpsLayout.js";
import { OpsLoginScreen } from "@/components/OpsLoginScreen.js";
import { OnboardUniversityModal } from "@/components/OnboardUniversityModal.js";
import { GuardrailsPage } from "@/pages/GuardrailsPage.js";
import { HitlPage } from "@/pages/HitlPage.js";
import { OverviewPage } from "@/pages/OverviewPage.js";
import { RunsPage } from "@/pages/RunsPage.js";
import { SourcesPage } from "@/pages/SourcesPage.js";

export function App() {
  const queryClient = useQueryClient();
  const [activeNav, setActiveNav] = useState<OpsNavKey>("overview");
  const [onboardOpen, setOnboardOpen] = useState(false);

  const authQuery = useQuery({
    queryKey: ["ops-auth-me"],
    queryFn: opsApi.me,
    retry: false,
  });

  const authenticated = Boolean(authQuery.data?.authenticated);

  const overviewQuery = useQuery({
    queryKey: ["ops-overview"],
    queryFn: opsApi.getOverview,
    enabled: authenticated,
  });

  if (authQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[13px] text-[#64748B]">
        正在检查运营管理端会话...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <>
        <OpsLoginScreen
          devTokenHint={authQuery.data?.devTokenHint}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["ops-auth-me"] })}
        />
        <Toaster richColors position="bottom-right" />
      </>
    );
  }

  const aiMode = overviewQuery.data?.guardrails?.defaultAiMode || "rule_only";
  const pendingBadgeCount =
    (overviewQuery.data?.kpis.pendingAdvisors || 0) +
    (overviewQuery.data?.kpis.pendingNotices || 0);

  return (
    <>
      <OpsLayout
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        aiMode={aiMode}
        pendingBadgeCount={pendingBadgeCount}
        onLogout={async () => {
          await opsApi.logout();
          queryClient.invalidateQueries({ queryKey: ["ops-auth-me"] });
        }}
      >
        {activeNav === "overview" && (
          <OverviewPage
            onNavigate={setActiveNav}
            onOpenOnboardModal={() => setOnboardOpen(true)}
          />
        )}
        {activeNav === "sources" && (
          <SourcesPage onOpenOnboardModal={() => setOnboardOpen(true)} />
        )}
        {activeNav === "runs" && <RunsPage />}
        {activeNav === "hitl" && <HitlPage />}
        {activeNav === "guardrails" && <GuardrailsPage />}
      </OpsLayout>

      <OnboardUniversityModal
        open={onboardOpen}
        onClose={() => setOnboardOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["ops-universities"] });
          queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
        }}
      />
      <Toaster richColors position="bottom-right" />
    </>
  );
}
