import crypto from "node:crypto";
import { Hono } from "hono";
import Papa from "papaparse";
import { normalizeAdvisorStage, normalizeMatchTier } from "@app/shared";
import { db, eq, firstOrNull, LOCAL_USER_ID, schema } from "@app/db";
import { findOrCreateInstitution } from "../helpers/domain.js";

/**
 * 轻量 CSV / JSON 全量导入与备份导出路由。
 */
export function createDataIoRoutes() {
  const router = new Hono();

  router.get("/api/data/export/csv", async (c) => {
    const [advisorRows, instRows, draftRows] = await Promise.all([
      db.select().from(schema.advisors).where(eq(schema.advisors.userId, LOCAL_USER_ID)),
      db.select().from(schema.institutions).where(eq(schema.institutions.userId, LOCAL_USER_ID)),
      db.select().from(schema.outreachDrafts),
    ]);
    const instMap = new Map(instRows.map((i) => [i.id, i.name]));
    const draftMap = new Map(draftRows.map((d) => [d.advisorId, d]));

    const rows = advisorRows.map((a) => {
      const d = draftMap.get(a.id);
      return {
        高校: instMap.get(a.institutionId) || "",
        导师姓名: a.name,
        院系: a.dept,
        职称: a.title,
        邮箱: a.email,
        主页: a.homepageUrl,
        匹配度: a.matchTier,
        状态: a.stage,
        研究标签: (a.researchTags || []).join(" | "),
        研究方向: a.researchSummary,
        研究契合笔记: a.hookNote,
        邮件主题: d?.subject || "",
        邮件正文: d?.body || "",
        个人备忘: a.userNotes,
        回信记录: a.replyNote,
        最近联系时间: a.lastSentAt || "",
      };
    });

    const csv = "\uFEFF" + Papa.unparse(rows);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="advisors_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  });

  router.get("/api/data/export/json", async (c) => {
    const [profile, institutions, advisors, drafts] = await Promise.all([
      firstOrNull(
        db
          .select()
          .from(schema.applicantProfiles)
          .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID))
          .limit(1)
      ),
      db.select().from(schema.institutions).where(eq(schema.institutions.userId, LOCAL_USER_ID)),
      db.select().from(schema.advisors).where(eq(schema.advisors.userId, LOCAL_USER_ID)),
      db.select().from(schema.outreachDrafts),
    ]);

    const payload = JSON.stringify(
      { exportedAt: new Date().toISOString(), version: "3.2", profile, institutions, advisors, drafts },
      null,
      2
    );
    return new Response(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="phd_workbench_backup_${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  });

  router.post("/api/data/import/csv", async (c) => {
    try {
      const body = (await c.req.json()) as {
        csvText?: string;
        defaultInstitution?: string;
      };
      if (!body.csvText || !body.csvText.trim()) {
        return c.json({ ok: false, error: "CSV 内容不能为空" }, 400);
      }
      const parsed = Papa.parse<Record<string, string>>(body.csvText.trim(), {
        header: true,
        skipEmptyLines: true,
      });

      const pick = (row: Record<string, string>, keys: string[]): string => {
        for (const k of keys) {
          if (row[k] !== undefined && String(row[k]).trim()) {
            return String(row[k]).trim();
          }
        }
        return "";
      };

      let added = 0;
      let skipped = 0;
      const now = new Date().toISOString();

      const existingAll = await db
        .select()
        .from(schema.advisors)
        .where(eq(schema.advisors.userId, LOCAL_USER_ID));
      const seenKeys = new Set(
        existingAll.map((a) => `${a.institutionId}::${a.name.trim()}`)
      );

      for (const row of parsed.data) {
        const name = pick(row, ["导师姓名", "姓名", "name", "Name"]);
        if (!name) continue;
        const school =
          pick(row, ["高校", "学校", "institution", "school", "School"]) ||
          body.defaultInstitution ||
          "导入高校";
        const inst = await findOrCreateInstitution(school);
        const dupKey = `${inst.id}::${name}`;
        if (seenKeys.has(dupKey)) {
          skipped += 1;
          continue;
        }

        const email = pick(row, ["邮箱", "公开邮箱", "email", "Email"]);
        const dept = pick(row, ["院系", "学院", "学院/单位", "dept"]);
        const title = pick(row, ["职称", "职称与博导资格", "title"]);
        const homepageUrl = pick(row, ["主页", "官网", "homepage", "homepageUrl"]);
        const tagsRaw = pick(row, ["研究标签", "匹配方向标签", "tags"]);
        const research = pick(row, ["研究方向", "详细研究方向与代表亮点", "research"]);
        const hookNote = pick(row, ["研究契合笔记", "切入点", "hook"]);
        const userNotes = pick(row, ["个人备忘", "个人备注 / 来源", "note"]);
        const matchRaw = pick(row, ["匹配度", "优先级", "priority", "matchTier"]);
        const stageRaw = pick(row, ["状态", "沟通状态", "投递状态", "stage", "status"]);
        const subject = pick(row, ["邮件主题", "subject"]);
        const draftBody = pick(row, ["邮件正文", "body"]);

        const advisorId = crypto.randomUUID();
        await db.insert(schema.advisors).values({
          id: advisorId,
          userId: LOCAL_USER_ID,
          institutionId: inst.id,
          catalogAdvisorId: null,
          name,
          dept,
          title,
          honorBadge: "",
          email,
          homepageUrl,
          scholarUrl: "",
          avatarSeed: `${inst.name}::${name}`,
          photoUrl: "",
          photoSource: "",
          researchTags: tagsRaw
            ? tagsRaw.split(/[|,，/]/).map((s) => s.trim()).filter(Boolean)
            : [],
          researchSummary: research,
          representativeWorks: [],
          recruitmentSignal: null,
          matchTier: normalizeMatchTier(matchRaw),
          matchScore: null,
          stage: normalizeAdvisorStage(stageRaw),
          inBatch: true,
          assignedAccountId: "auto",
          hookNote,
          userNotes,
          replyNote: "",
          trackSummary: "",
          aiInsights: null,
          researchEmbedding: null,
          lastSentAt: null,
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(schema.outreachDrafts).values({
          id: crypto.randomUUID(),
          advisorId,
          subject,
          body: draftBody,
          selectedHook: hookNote,
          resumeId: null,
          preferredAccountId: "auto",
          templateStyle: "editorial",
          embedContactCard: true,
          updatedAt: now,
        });
        seenKeys.add(dupKey);
        added += 1;
      }

      return c.json({ ok: true, added, skipped });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "CSV 导入失败" },
        400
      );
    }
  });

  return router;
}
