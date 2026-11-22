import type { ApplicantProfile } from "@app/shared";

/**
 * 将申请人的结构化科研名片拼装为传给 AI 的只读上下文块。
 * 系统级 System Prompt 与各场景微调指令统一由 prompts/registry.ts 从数据库热加载。
 */
export function buildProfileContextBlock(profile: ApplicantProfile): string {
  const pubs =
    profile.publications.length > 0
      ? profile.publications
          .map(
            (p, idx) =>
              `  ${idx + 1}. 《${p.title}》 (${p.venue || "未注刊物"}, ${p.year || "年份未知"}, ${p.authorOrder || "作者位次未注"}, ${p.status || "已发表"})`
          )
          .join("\n")
      : "  （未填写结构化论文列表）";

  const projs =
    profile.projects.length > 0
      ? profile.projects
          .map(
            (p, idx) =>
              `  ${idx + 1}. ${p.name} [${p.role || "参与"} | ${p.period || ""}]：${p.summary || ""}`
          )
          .join("\n")
      : "  （未填写结构化项目列表）";

  const cvSnippet = profile.cvParsedText
    ? `\n- 默认简历 PDF 解析摘要：\n${profile.cvParsedText.slice(0, 2200)}`
    : "";

  return `【申请人结构化名片】
- 姓名：${profile.name || "未填写"}
- 所在院校：${profile.affiliation || "未填写"}
- 年级与专业：${profile.degreeInfo || "未填写"}
- 意向读博方向：${profile.targetDirections.join("、") || "未填写"}
- 研究方法与技能：${profile.methodsSkills.join("、") || "未填写"}
- 科研总结概述：${profile.researchSummary || "未填写"}
- 联系方式：手机 ${profile.phone || "未填"} | 微信 ${profile.wechat || "未填"} | 主页 ${profile.homepageUrl || "未填"}
- 代表论文：\n${pubs}
- 代表科研项目：\n${projs}${cvSnippet}`;
}
