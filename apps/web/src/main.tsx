import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tooltip } from "@base-ui/react/tooltip";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import App from "./App.js";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * 前端工作台渲染入口：挂载 React Query、Motion 全局减弱动效策略、Base UI Tooltip 与 Sonner 通知。
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <Tooltip.Provider delay={260} closeDelay={80}>
          <App />
          <Toaster
            position="bottom-right"
            toastOptions={{
              className:
                "!rounded-2xl !border !border-slate-200/80 !bg-white/92 !backdrop-blur-xl !shadow-[0_12px_36px_rgba(15,23,42,0.12)] !text-[#111827] !text-[13px]",
            }}
          />
        </Tooltip.Provider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>
);
