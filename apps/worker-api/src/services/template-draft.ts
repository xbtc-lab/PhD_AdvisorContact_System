import type { Advisor, ApplicantProfile } from "@app/shared";

export function generateAcademicTemplateDraft(
  profile: ApplicantProfile,
  advisor: Advisor
): { subject: string; body: string } {
  const myName = profile.name.trim() || "【您的姓名】";
  const mySchool = profile.affiliation.trim() || "【您的在读/毕业院校】";
  const myDegree = profile.degreeInfo.trim() || "【年级与专业，如：2024级硕士研究生】";
  const schoolName = advisor.institutionName || "贵校";
  const researchClean =
    (advisor.researchSummary || advisor.researchTags.join("、"))
      .replace(/[（(][^）)]*[）)]/g, "")
      .trim()
      .replace(/[，、,;；\s]+$/, "") || "相关前沿方向";
  const hook = advisor.hookNote.trim().replace(/[。，、.;；!！\s]+$/, "");

  const subject = `【博士申请自荐】— ${myName}（${mySchool}）`;

  const pubsBlock =
    profile.publications.length > 0
      ? `\n代表性学术成果包括：${profile.publications
          .slice(0, 2)
          .map((p) => `《${p.title}》${p.venue ? `（${p.venue}）` : ""}`)
          .join("、")}。`
      : "";

  const workPara = profile.researchSummary.trim()
    ? `${profile.researchSummary.trim()}${pubsBlock}`
    : `【建议在右上角「设置 → 我的名片与简历」中补充您的科研经历与论文列表，或右侧打开「AI 写信助手」自动润色】研究生阶段我围绕核心研究问题完成了系统的文献梳理、方法实验与学术写作训练。${pubsBlock}`;

  const hookPara = hook
    ? `了解到您课题组长期聚焦于${researchClean}，${hook}，希望博士阶段能有机会在您的指导下继续深入研究。`
    : `此前在${schoolName}主页了解到您课题组主要聚焦于${researchClean}，与我目前积累的研究兴趣与方法训练较为契合，希望博士阶段能沿着您的方向继续做深。`;

  const contactLines = [myName, `${mySchool} · ${myDegree}`];
  const parts: string[] = [];
  if (profile.phone.trim()) parts.push(`手机：${profile.phone.trim()}`);
  if (profile.wechat.trim()) parts.push(`微信：${profile.wechat.trim()}`);
  if (parts.length > 0) contactLines.push(parts.join(" | "));
  if (profile.homepageUrl.trim()) {
    contactLines.push(`个人主页：${profile.homepageUrl.trim()}`);
  }

  const body = `尊敬的${advisor.name}老师：

您好！冒昧给您写信。我是${mySchool}${myDegree}${myName}。此前在${schoolName}主页了解到您课题组的研究布局，特此来信咨询您是否有博士研究生的招生计划。

在过往科研学习中，我的研究与实践重点如下：
${workPara}

${hookPara}

随信附上个人简历，烦请您在方便时查阅。若您觉得我的研究背景与课题组需求有结合的可能，非常希望能有机会向您简要汇报近期工作，并听取您对博士阶段研究的建议。感谢您拨冗阅读，期待您的回复！

此致
敬礼！

${contactLines.join("\n")}
`;

  return { subject, body };
}
