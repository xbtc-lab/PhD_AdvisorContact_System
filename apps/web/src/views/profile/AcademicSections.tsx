import { useState } from "react";
import {
  Award,
  BookOpen,
  Briefcase,
  GraduationCap,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import type {
  ApplicantProfile,
  CompetitionItem,
  EducationItem,
  HonorItem,
  ProjectItem,
  PublicationItem,
} from "@app/shared";
import { cn } from "@/lib/cn.js";
import { Button } from "@/components/ui/Button.js";

export interface AcademicSectionsProps {
  profile: ApplicantProfile;
  onChange: (next: ApplicantProfile) => void;
}

function genId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 履历右栏四大结构化档案模块：
 * 1) 教育背景、GPA/排名与研究标签
 * 2) 学术论文与专利代表作（含 injectToAi 写入权重开关）
 * 3) 学科竞赛与科研项目经历
 * 4) 奖学金与重要荣誉
 */
export function AcademicSections({ profile, onChange }: AcademicSectionsProps) {
  // ── 教育经历表单状态 ──────────────────────────────────────────────
  const [eduFormOpen, setEduFormOpen] = useState(false);
  const [editingEduId, setEditingEduId] = useState<string | null>(null);
  const [eduDraft, setEduDraft] = useState<Omit<EducationItem, "id">>({
    school: "",
    degree: "硕士",
    major: "",
    period: "",
    gpa: "",
    rankNote: "",
    isPrimary: false,
  });

  // ── 论文/专利表单状态 ──────────────────────────────────────────────
  const [pubFormOpen, setPubFormOpen] = useState(false);
  const [editingPubId, setEditingPubId] = useState<string | null>(null);
  const [pubDraft, setPubDraft] = useState<Omit<PublicationItem, "id">>({
    title: "",
    venue: "",
    year: String(new Date().getFullYear()),
    authorOrder: "第一作者",
    status: "在审 / Under Review",
    injectToAi: true,
    summary: "",
    kind: "paper",
  });

  // ── 竞赛/项目切换与表单状态 ─────────────────────────────────────────
  const [compTab, setCompTab] = useState<"competitions" | "projects">("competitions");
  const [compFormOpen, setCompFormOpen] = useState(false);
  const [compDraft, setCompDraft] = useState<Omit<CompetitionItem, "id">>({
    name: "",
    award: "",
    year: String(new Date().getFullYear()),
    role: "队长 / 主力成员",
    note: "",
  });

  const [projFormOpen, setProjFormOpen] = useState(false);
  const [projDraft, setProjDraft] = useState<Omit<ProjectItem, "id">>({
    name: "",
    role: "核心成员",
    period: "",
    summary: "",
  });

  // ── 荣誉表单状态 ────────────────────────────────────────────────────
  const [honorFormOpen, setHonorFormOpen] = useState(false);
  const [honorDraft, setHonorDraft] = useState<Omit<HonorItem, "id">>({
    title: "",
    issuer: "",
    year: String(new Date().getFullYear()),
    level: "国家级",
  });

  // ── 技能与方向标签输入 ──────────────────────────────────────────────
  const [dirInput, setDirInput] = useState("");
  const [skillInput, setSkillInput] = useState("");

  function addDirectionTag() {
    const val = dirInput.trim();
    if (!val) return;
    if (!profile.targetDirections.includes(val)) {
      onChange({
        ...profile,
        targetDirections: [...profile.targetDirections, val],
      });
    }
    setDirInput("");
  }

  function addSkillTag() {
    const val = skillInput.trim();
    if (!val) return;
    if (!profile.methodsSkills.includes(val)) {
      onChange({
        ...profile,
        methodsSkills: [...profile.methodsSkills, val],
      });
    }
    setSkillInput("");
  }

  function submitEduForm() {
    if (!eduDraft.school.trim()) return;
    if (editingEduId) {
      onChange({
        ...profile,
        educationHistory: profile.educationHistory.map((e) =>
          e.id === editingEduId ? { id: editingEduId, ...eduDraft } : e
        ),
      });
    } else {
      onChange({
        ...profile,
        educationHistory: [
          ...profile.educationHistory,
          { id: genId("edu"), ...eduDraft },
        ],
      });
    }
    setEduFormOpen(false);
    setEditingEduId(null);
    setEduDraft({
      school: "",
      degree: "硕士",
      major: "",
      period: "",
      gpa: "",
      rankNote: "",
      isPrimary: false,
    });
  }

  function submitPubForm() {
    if (!pubDraft.title.trim()) return;
    if (editingPubId) {
      onChange({
        ...profile,
        publications: profile.publications.map((p) =>
          p.id === editingPubId ? { id: editingPubId, ...pubDraft } : p
        ),
      });
    } else {
      onChange({
        ...profile,
        publications: [
          ...profile.publications,
          { id: genId("pub"), ...pubDraft },
        ],
      });
    }
    setPubFormOpen(false);
    setEditingPubId(null);
    setPubDraft({
      title: "",
      venue: "",
      year: String(new Date().getFullYear()),
      authorOrder: "第一作者",
      status: "在审 / Under Review",
      injectToAi: true,
      summary: "",
      kind: "paper",
    });
  }

  function submitCompForm() {
    if (!compDraft.name.trim()) return;
    onChange({
      ...profile,
      competitions: [
        ...profile.competitions,
        { id: genId("comp"), ...compDraft },
      ],
    });
    setCompFormOpen(false);
    setCompDraft({
      name: "",
      award: "",
      year: String(new Date().getFullYear()),
      role: "队长 / 主力成员",
      note: "",
    });
  }

  function submitProjForm() {
    if (!projDraft.name.trim()) return;
    onChange({
      ...profile,
      projects: [...profile.projects, { id: genId("proj"), ...projDraft }],
    });
    setProjFormOpen(false);
    setProjDraft({ name: "", role: "核心成员", period: "", summary: "" });
  }

  function submitHonorForm() {
    if (!honorDraft.title.trim()) return;
    onChange({
      ...profile,
      honors: [...profile.honors, { id: genId("honor"), ...honorDraft }],
    });
    setHonorFormOpen(false);
    setHonorDraft({
      title: "",
      issuer: "",
      year: String(new Date().getFullYear()),
      level: "国家级",
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. 教育背景、绩点排名与标签 */}
      <section id="profile-edu" className="card-surface p-6 space-y-4 scroll-mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[15.5px] font-bold text-[#0F172A] flex items-center gap-2">
              <GraduationCap className="w-4 h-4 theme-text shrink-0" />
              教育背景、绩点排名与核心能力标签
            </h3>
            <p className="text-[11.5px] text-[#64748B] mt-0.5">
              硕博及本科院校、GPA、排名与外语成绩将作为 AI 套磁写信与匹配打分核心依据
            </p>
          </div>
          <Button
            variant="secondary"
            size="xs"
            className="shrink-0 whitespace-nowrap"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              setEditingEduId(null);
              setEduDraft({
                school: "",
                degree: "硕士",
                major: "",
                period: "",
                gpa: "",
                rankNote: "",
                isPrimary: false,
              });
              setEduFormOpen(true);
            }}
          >
            添加教育经历
          </Button>
        </div>

        {eduFormOpen && (
          <div className="card-well p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                placeholder="院校名称（必填）"
                value={eduDraft.school}
                onChange={(e) => setEduDraft({ ...eduDraft, school: e.target.value })}
                className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <input
                type="text"
                placeholder="学历层次（如：硕士 / 本科）"
                value={eduDraft.degree}
                onChange={(e) => setEduDraft({ ...eduDraft, degree: e.target.value })}
                className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <input
                type="text"
                placeholder="专业名称"
                value={eduDraft.major}
                onChange={(e) => setEduDraft({ ...eduDraft, major: e.target.value })}
                className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <input
                type="text"
                placeholder="起止时间（如：2023.09 - 2026.06）"
                value={eduDraft.period}
                onChange={(e) => setEduDraft({ ...eduDraft, period: e.target.value })}
                className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <input
                type="text"
                placeholder="GPA（如：3.86 / 4.0）"
                value={eduDraft.gpa}
                onChange={(e) => setEduDraft({ ...eduDraft, gpa: e.target.value })}
                className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <input
                type="text"
                placeholder="排名或推免备注（如：前 5%）"
                value={eduDraft.rankNote}
                onChange={(e) => setEduDraft({ ...eduDraft, rankNote: e.target.value })}
                className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="xs" onClick={() => setEduFormOpen(false)}>
                取消
              </Button>
              <Button variant="primary" size="xs" onClick={submitEduForm}>
                {editingEduId ? "更新该学历" : "确认添加"}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {profile.educationHistory.length === 0 ? (
            <div className="py-5 text-center text-[12px] text-[#94A3B8] border border-dashed border-slate-200 rounded-[16px]">
              暂未登记教育背景，点击右上角添加本硕学习经历
            </div>
          ) : (
            profile.educationHistory.map((edu) => (
              <div
                key={edu.id}
                className="p-3.5 rounded-[16px] bg-[#FAFAFB] hairline flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-[#0F172A]">
                      {edu.school}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white hairline text-[#334155]">
                      {edu.degree}
                      {edu.major ? ` · ${edu.major}` : ""}
                    </span>
                    {edu.period && (
                      <span className="text-[11.5px] text-[#64748B]">{edu.period}</span>
                    )}
                  </div>
                  {(edu.gpa || edu.rankNote) && (
                    <div className="text-[12px] text-[#475569] flex flex-wrap items-center gap-3">
                      {edu.gpa && <span>GPA：{edu.gpa}</span>}
                      {edu.rankNote && <span>排名：{edu.rankNote}</span>}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEduId(edu.id);
                      setEduDraft({
                        school: edu.school,
                        degree: edu.degree,
                        major: edu.major,
                        period: edu.period,
                        gpa: edu.gpa,
                        rankNote: edu.rankNote,
                        isPrimary: edu.isPrimary,
                      });
                      setEduFormOpen(true);
                    }}
                    className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...profile,
                        educationHistory: profile.educationHistory.filter(
                          (x) => x.id !== edu.id
                        ),
                      })
                    }
                    className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#64748B] hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 外语、拟研究方向与技能栈 */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5 min-w-0">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              外语等级成绩
            </label>
            <input
              type="text"
              value={profile.languageScores}
              onChange={(e) =>
                onChange({ ...profile, languageScores: e.target.value })
              }
              placeholder="如：CET-6 586 / IELTS 7.0"
              className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
            />
          </div>

          <div className="space-y-1.5 min-w-0">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              拟申博研究方向（回车或点 + 添加）
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={dirInput}
                onChange={(e) => setDirInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDirectionTag();
                  }
                }}
                placeholder="如：智能微系统"
                className="min-w-0 flex-1 h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <button
                type="button"
                aria-label="添加拟申博研究方向"
                title="添加研究方向"
                onClick={addDirectionTag}
                className="w-9 h-9 shrink-0 rounded-[12px] bg-[#141417] text-white inline-flex items-center justify-center hover:bg-[#27272a] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.targetDirections.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium theme-soft-pill"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...profile,
                        targetDirections: profile.targetDirections.filter(
                          (x) => x !== tag
                        ),
                      })
                    }
                    className="cursor-pointer opacity-70 hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 min-w-0">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              方法与实验技能（回车或点 + 添加）
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkillTag();
                  }
                }}
                placeholder="如：PyTorch / COMSOL"
                className="min-w-0 flex-1 h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <button
                type="button"
                aria-label="添加实验技能"
                title="添加技能标签"
                onClick={addSkillTag}
                className="w-9 h-9 shrink-0 rounded-[12px] bg-[#141417] text-white inline-flex items-center justify-center hover:bg-[#27272a] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.methodsSkills.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F4F5F7] text-[#334155] border border-slate-200/80"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...profile,
                        methodsSkills: profile.methodsSkills.filter((x) => x !== tag),
                      })
                    }
                    className="cursor-pointer opacity-70 hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 2. 学术论文与专利代表作 */}
      <section id="profile-pubs" className="card-surface p-6 space-y-4 scroll-mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-bold text-[#0F172A] flex items-center gap-2">
              <BookOpen className="w-4 h-4 theme-text" />
              学术论文与专利代表作（{profile.publications.length}）
            </h3>
            <p className="text-[11.5px] text-[#64748B] mt-0.5">
              开启「自动写入 AI 套磁上下文」的成果，将在写信工坊中精准锚定进开篇亮点
            </p>
          </div>
          <Button
            variant="secondary"
            size="xs"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              setEditingPubId(null);
              setPubDraft({
                title: "",
                venue: "",
                year: String(new Date().getFullYear()),
                authorOrder: "第一作者",
                status: "已发表 / Published",
                injectToAi: true,
                summary: "",
                kind: "paper",
              });
              setPubFormOpen(true);
            }}
          >
            添加论文 / 专利
          </Button>
        </div>

        {pubFormOpen && (
          <div className="card-well p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                placeholder="论文题目或发明专利名称（必填）"
                value={pubDraft.title}
                onChange={(e) => setPubDraft({ ...pubDraft, title: e.target.value })}
                className="sm:col-span-2 h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <input
                type="text"
                placeholder="期刊/会议（如：IEEE TIM / CVPR / 国家发明专利）"
                value={pubDraft.venue}
                onChange={(e) => setPubDraft({ ...pubDraft, venue: e.target.value })}
                className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={pubDraft.kind || "paper"}
                  onChange={(e) =>
                    setPubDraft({
                      ...pubDraft,
                      kind: e.target.value as "paper" | "patent",
                    })
                  }
                  className="h-9 px-2.5 rounded-[12px] bg-white hairline text-[12px] text-[#0F172A] outline-none"
                >
                  <option value="paper">期刊/会议论文</option>
                  <option value="patent">发明专利</option>
                </select>
                <input
                  type="text"
                  placeholder="年份"
                  value={pubDraft.year}
                  onChange={(e) => setPubDraft({ ...pubDraft, year: e.target.value })}
                  className="h-9 px-2.5 rounded-[12px] bg-white hairline text-[12px] text-[#0F172A] outline-none"
                />
                <input
                  type="text"
                  placeholder="作序"
                  value={pubDraft.authorOrder}
                  onChange={(e) =>
                    setPubDraft({ ...pubDraft, authorOrder: e.target.value })
                  }
                  className="h-9 px-2.5 rounded-[12px] bg-white hairline text-[12px] text-[#0F172A] outline-none"
                />
              </div>
              <input
                type="text"
                placeholder="录用状态（如：中科院一区 Top / 已授权）"
                value={pubDraft.status}
                onChange={(e) => setPubDraft({ ...pubDraft, status: e.target.value })}
                className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <input
                type="text"
                placeholder="一句话贡献亮点摘要（可选）"
                value={pubDraft.summary || ""}
                onChange={(e) => setPubDraft({ ...pubDraft, summary: e.target.value })}
                className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-[12px] text-[#334155] cursor-pointer">
                <input
                  type="checkbox"
                  checked={pubDraft.injectToAi !== false}
                  onChange={(e) =>
                    setPubDraft({ ...pubDraft, injectToAi: e.target.checked })
                  }
                  className="accent-[var(--accent)]"
                />
                <span>优先写入 AI 套磁信草稿上下文</span>
              </label>
              <div className="flex gap-2">
                <Button variant="ghost" size="xs" onClick={() => setPubFormOpen(false)}>
                  取消
                </Button>
                <Button variant="primary" size="xs" onClick={submitPubForm}>
                  {editingPubId ? "保存修改" : "确认添加"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {profile.publications.length === 0 ? (
            <div className="py-5 text-center text-[12px] text-[#94A3B8] border border-dashed border-slate-200 rounded-[16px]">
              暂未添加代表作或专利记录
            </div>
          ) : (
            profile.publications.map((pub) => {
              const injected = pub.injectToAi !== false;
              const kindLabel = pub.kind === "patent" ? "专利" : "论文";
              return (
                <div
                  key={pub.id}
                  className="p-3.5 rounded-[16px] bg-[#FAFAFB] hairline flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-white hairline text-[#0F172A]">
                        {kindLabel}
                      </span>
                      <span className="text-[13.5px] font-semibold text-[#0F172A]">
                        {pub.title}
                      </span>
                    </div>
                    <div className="text-[12px] text-[#64748B] flex flex-wrap items-center gap-2">
                      {pub.venue && <span className="font-medium text-[#334155]">{pub.venue}</span>}
                      {pub.year && <span>{pub.year}</span>}
                      {pub.authorOrder && <span>· {pub.authorOrder}</span>}
                      {pub.status && (
                        <span className="px-2 py-0.5 rounded-full text-[10.5px] honor-stone">
                          {pub.status}
                        </span>
                      )}
                    </div>
                    {pub.summary && (
                      <p className="text-[11.5px] text-[#475569] leading-[1.55]">
                        {pub.summary}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...profile,
                          publications: profile.publications.map((x) =>
                            x.id === pub.id ? { ...x, injectToAi: !injected } : x
                          ),
                        })
                      }
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-all",
                        injected
                          ? "theme-soft-pill"
                          : "bg-white text-[#94A3B8] border-slate-200/80"
                      )}
                      title="点击切换是否在 AI 写信时引用此篇成果"
                    >
                      <Sparkles className="w-3 h-3" />
                      {injected ? "已注入 AI 写信" : "暂不写入 AI"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPubId(pub.id);
                        setPubDraft({
                          title: pub.title,
                          venue: pub.venue,
                          year: pub.year,
                          authorOrder: pub.authorOrder,
                          status: pub.status,
                          injectToAi: pub.injectToAi !== false,
                          summary: pub.summary || "",
                          kind: pub.kind || "paper",
                        });
                        setPubFormOpen(true);
                      }}
                      className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...profile,
                          publications: profile.publications.filter(
                            (x) => x.id !== pub.id
                          ),
                        })
                      }
                      className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#64748B] hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 3. 学科竞赛与科研项目 */}
      <section id="profile-projects" className="card-surface p-6 space-y-4 scroll-mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h3 className="text-[15px] font-bold text-[#0F172A] flex items-center gap-2">
              {compTab === "competitions" ? (
                <Trophy className="w-4 h-4 theme-text" />
              ) : (
                <Briefcase className="w-4 h-4 theme-text" />
              )}
              实践、竞赛与项目履历
            </h3>
            <div className="inline-flex items-center p-0.5 rounded-full bg-[#F4F5F7] border border-slate-200/70">
              <button
                type="button"
                onClick={() => setCompTab("competitions")}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11.5px] font-medium cursor-pointer transition-all",
                  compTab === "competitions"
                    ? "bg-[#141417] text-white"
                    : "text-[#475569]"
                )}
              >
                学科竞赛（{profile.competitions.length}）
              </button>
              <button
                type="button"
                onClick={() => setCompTab("projects")}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11.5px] font-medium cursor-pointer transition-all",
                  compTab === "projects"
                    ? "bg-[#141417] text-white"
                    : "text-[#475569]"
                )}
              >
                科研项目（{profile.projects.length}）
              </button>
            </div>
          </div>

          <Button
            variant="secondary"
            size="xs"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() =>
              compTab === "competitions"
                ? setCompFormOpen(true)
                : setProjFormOpen(true)
            }
          >
            {compTab === "competitions" ? "添加竞赛获奖" : "添加科研项目"}
          </Button>
        </div>

        {compTab === "competitions" ? (
          <>
            {compFormOpen && (
              <div className="card-well p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="竞赛名称（如：中国研究生电子设计竞赛）"
                    value={compDraft.name}
                    onChange={(e) =>
                      setCompDraft({ ...compDraft, name: e.target.value })
                    }
                    className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
                  />
                  <input
                    type="text"
                    placeholder="获奖等级（如：全国一等奖 / 金奖）"
                    value={compDraft.award}
                    onChange={(e) =>
                      setCompDraft({ ...compDraft, award: e.target.value })
                    }
                    className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
                  />
                  <input
                    type="text"
                    placeholder="年份"
                    value={compDraft.year}
                    onChange={(e) =>
                      setCompDraft({ ...compDraft, year: e.target.value })
                    }
                    className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
                  />
                  <input
                    type="text"
                    placeholder="担任角色"
                    value={compDraft.role}
                    onChange={(e) =>
                      setCompDraft({ ...compDraft, role: e.target.value })
                    }
                    className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
                  />
                  <input
                    type="text"
                    placeholder="成果简介与分工说明（可选）"
                    value={compDraft.note}
                    onChange={(e) =>
                      setCompDraft({ ...compDraft, note: e.target.value })
                    }
                    className="sm:col-span-2 h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setCompFormOpen(false)}
                  >
                    取消
                  </Button>
                  <Button variant="primary" size="xs" onClick={submitCompForm}>
                    确认添加
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {profile.competitions.length === 0 ? (
                <div className="py-5 text-center text-[12px] text-[#94A3B8] border border-dashed border-slate-200 rounded-[16px]">
                  暂未登记竞赛奖项
                </div>
              ) : (
                profile.competitions.map((comp) => (
                  <div
                    key={comp.id}
                    className="p-3.5 rounded-[16px] bg-[#FAFAFB] hairline flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-bold text-[#0F172A]">
                          {comp.name}
                        </span>
                        {comp.award && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium honor-stone">
                            {comp.award}
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        {[comp.year, comp.role, comp.note]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...profile,
                          competitions: profile.competitions.filter(
                            (x) => x.id !== comp.id
                          ),
                        })
                      }
                      className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#64748B] hover:text-rose-600 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {projFormOpen && (
              <div className="card-well p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    placeholder="项目或基金课题名称（必填）"
                    value={projDraft.name}
                    onChange={(e) =>
                      setProjDraft({ ...projDraft, name: e.target.value })
                    }
                    className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
                  />
                  <input
                    type="text"
                    placeholder="承担角色（如：核心主研）"
                    value={projDraft.role}
                    onChange={(e) =>
                      setProjDraft({ ...projDraft, role: e.target.value })
                    }
                    className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
                  />
                  <input
                    type="text"
                    placeholder="时间段"
                    value={projDraft.period}
                    onChange={(e) =>
                      setProjDraft({ ...projDraft, period: e.target.value })
                    }
                    className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
                  />
                  <input
                    type="text"
                    placeholder="研究内容与个人贡献摘要"
                    value={projDraft.summary}
                    onChange={(e) =>
                      setProjDraft({ ...projDraft, summary: e.target.value })
                    }
                    className="sm:col-span-3 h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setProjFormOpen(false)}
                  >
                    取消
                  </Button>
                  <Button variant="primary" size="xs" onClick={submitProjForm}>
                    确认添加
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {profile.projects.length === 0 ? (
                <div className="py-5 text-center text-[12px] text-[#94A3B8] border border-dashed border-slate-200 rounded-[16px]">
                  暂未登记科研项目经历
                </div>
              ) : (
                profile.projects.map((proj) => (
                  <div
                    key={proj.id}
                    className="p-3.5 rounded-[16px] bg-[#FAFAFB] hairline flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-bold text-[#0F172A]">
                          {proj.name}
                        </span>
                        {proj.role && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white hairline text-[#334155]">
                            {proj.role}
                          </span>
                        )}
                        {proj.period && (
                          <span className="text-[11.5px] text-[#64748B]">
                            {proj.period}
                          </span>
                        )}
                      </div>
                      {proj.summary && (
                        <p className="text-[12px] text-[#475569] leading-[1.55]">
                          {proj.summary}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...profile,
                          projects: profile.projects.filter((x) => x.id !== proj.id),
                        })
                      }
                      className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#64748B] hover:text-rose-600 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>

      {/* 4. 奖学金与重要荣誉 */}
      <section id="profile-honors" className="card-surface p-6 space-y-4 scroll-mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-bold text-[#0F172A] flex items-center gap-2">
            <Award className="w-4 h-4 theme-text" />
            奖学金与学术荣誉（{profile.honors.length}）
          </h3>
          <Button
            variant="secondary"
            size="xs"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setHonorFormOpen(true)}
          >
            添加荣誉称号
          </Button>
        </div>

        {honorFormOpen && (
          <div className="card-well p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <input
                type="text"
                placeholder="荣誉名称（如：国家奖学金）"
                value={honorDraft.title}
                onChange={(e) =>
                  setHonorDraft({ ...honorDraft, title: e.target.value })
                }
                className="sm:col-span-2 h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <input
                type="text"
                placeholder="颁发机构"
                value={honorDraft.issuer}
                onChange={(e) =>
                  setHonorDraft({ ...honorDraft, issuer: e.target.value })
                }
                className="h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={honorDraft.level}
                  onChange={(e) =>
                    setHonorDraft({ ...honorDraft, level: e.target.value })
                  }
                  className="h-9 px-2 rounded-[12px] bg-white hairline text-[12px] text-[#0F172A] outline-none"
                >
                  <option value="国家级">国家级</option>
                  <option value="省部级">省部级</option>
                  <option value="校级">校级</option>
                  <option value="专项">专项</option>
                </select>
                <input
                  type="text"
                  placeholder="年份"
                  value={honorDraft.year}
                  onChange={(e) =>
                    setHonorDraft({ ...honorDraft, year: e.target.value })
                  }
                  className="h-9 px-2.5 rounded-[12px] bg-white hairline text-[12px] text-[#0F172A] outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setHonorFormOpen(false)}
              >
                取消
              </Button>
              <Button variant="primary" size="xs" onClick={submitHonorForm}>
                确认添加
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {profile.honors.length === 0 ? (
            <div className="sm:col-span-2 py-5 text-center text-[12px] text-[#94A3B8] border border-dashed border-slate-200 rounded-[16px]">
              暂未登记奖学金或个人荣誉
            </div>
          ) : (
            profile.honors.map((honor) => (
              <div
                key={honor.id}
                className="p-3 rounded-[16px] bg-[#FAFAFB] hairline flex items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-[#0F172A]">
                      {honor.title}
                    </span>
                    {honor.level && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium honor-stone">
                        {honor.level}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">
                    {[honor.issuer, honor.year].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...profile,
                      honors: profile.honors.filter((x) => x.id !== honor.id),
                    })
                  }
                  className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#64748B] hover:text-rose-600 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
