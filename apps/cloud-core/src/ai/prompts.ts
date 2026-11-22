import type { ApplicantProfile } from "@app/shared";

/**
 * 将申请人的结构化科研履历拼装为传给 AI 的只读上下文块（严防事实编造）。
 * 系统级 System Prompt 与各场景微调指令统一由 prompts/registry.ts 从 PostgreSQL 热加载。
 */
export function buildProfileContextBlock(profile: ApplicantProfile): string {
  const eduText =
    profile.educationHistory.length > 0
      ? profile.educationHistory
          .map(
            (e, idx) =>
              `  ${idx + 1}. ${e.school || "未注院校"} | ${e.degree || "学位未注"} · ${e.major || "专业未注"} (${e.period || "时间未注"}) | GPA ${e.gpa || "未填"} | ${e.rankNote || ""}`
          )
          .join("\n")
      : "  （未填写分段教育经历）";

  // 优先展示标记为重点注入 AI 的论文与专利，确保发信核心亮点精准命中
  const sortedPubs = [...profile.publications].sort(
    (a, b) => Number(Boolean(b.injectToAi)) - Number(Boolean(a.injectToAi))
  );
  const pubs =
    sortedPubs.length > 0
      ? sortedPubs
          .map((p, idx) => {
            const flag = p.injectToAi ? "[重点注入AI] " : "";
            const kindLabel = p.kind === "patent" ? "专利" : "论文";
            const summaryPart = p.summary ? ` — 贡献简述：${p.summary}` : "";
            return `  ${idx + 1}. ${flag}[${kindLabel}]《${p.title}》 (${p.venue || "未注刊物"}, ${p.year || "年份未知"}, ${p.authorOrder || "作者位次未注"}, ${p.status || "已发表"})${summaryPart}`;
          })
          .join("\n")
      : "  （未填写结构化论文与专利列表）";

  const projs =
    profile.projects.length > 0
      ? profile.projects
          .map(
            (p, idx) =>
              `  ${idx + 1}. ${p.name} [${p.role || "参与"} | ${p.period || ""}]：${p.summary || ""}`
          )
          .join("\n")
      : "  （未填写结构化科研项目）";

  const comps =
    profile.competitions.length > 0
      ? profile.competitions
          .map(
            (c, idx) =>
              `  ${idx + 1}. ${c.name} · ${c.award} (${c.year || ""}${c.role ? `, ${c.role}` : ""})${c.note ? `：${c.note}` : ""}`
          )
          .join("\n")
      : "  （暂无竞赛记录）";

  const honors =
    profile.honors.length > 0
      ? profile.honors
          .map(
            (h, idx) =>
              `  ${idx + 1}. ${h.title} (${[h.level, h.issuer, h.year].filter(Boolean).join(" · ")})`
          )
          .join("\n")
      : "  （暂无荣誉记录）";

  const cvSnippet = profile.cvParsedText
    ? `\n- 默认简历 PDF 解析摘要：\n${profile.cvParsedText.slice(0, 2200)}`
    : "";

  return `【申请人结构化科研履历】
- 姓名：${profile.name || "未填写"}
- 当前院校：${profile.affiliation || "未填写"}
- 学位与年级：${profile.degreeInfo || "未填写"}
- 外语与标准化成绩：${profile.languageScores || "未填写"}
- 意向读博方向：${profile.targetDirections.join("、") || "未填写"}
- 研究方法与技术栈：${profile.methodsSkills.join("、") || "未填写"}
- 科研总结概述：${profile.researchSummary || "未填写"}
- 联系方式：手机 ${profile.phone || "未填"} | 微信 ${profile.wechat || "未填"} | 主页 ${profile.homepageUrl || "未填"}
- 教育背景与成绩排名：\n${eduText}
- 论文与专利成果：\n${pubs}
- 代表科研项目：\n${projs}
- 学科竞赛获奖：\n${comps}
- 荣誉与奖学金：\n${honors}${cvSnippet}`;
}
