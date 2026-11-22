# -*- coding: utf-8 -*-
"""
Full 985 / 211 / Double First-Class (147 Universities) Crawler & Merger.
Reuses verified 985 data while crawling the remaining 108 211 / 双一流 universities,
detecting secondary "师资队伍" faculty links, and emitting an audit report.
"""

import json
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

PIPE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPE_DIR))
import crawl_985 as c985

ROOT = PIPE_DIR.parents[1]
DATA_DIR = ROOT / "data"
BASE_ALL_PATH = PIPE_DIR / "base_all_target.json"
OVERRIDES_985_PATH = PIPE_DIR / "overrides_985.json"
OVERRIDES_ALL_PATH = PIPE_DIR / "overrides_all.json"
OUT_JSON_PATH = DATA_DIR / "universities.json"
REPORT_ALL_PATH = PIPE_DIR / "crawl_report_all.txt"


def root_academic_domain(url: str) -> str:
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    parts = host.split(".")
    if len(parts) >= 3 and host.endswith((".edu.cn", ".ac.cn")):
        return ".".join(parts[-3:])
    return host


# Monkeypatch domain helpers cleanly to support .ac.cn (e.g. ucas.ac.cn) as well
c985.root_edu_domain = root_academic_domain


def patch_special_domains():
    c985.KNOWN_ALIAS_DOMAINS.update({
        "pumc.edu.cn": {"cams.cn", "ibms.pumc.edu.cn", "pumch.cn"},
        "ruc.edu.cn": {"ruc.edu.cn"},
        "ucas.ac.cn": {"ucas.edu.cn", "cas.cn"},
        "cuc.edu.cn": {"cuc.edu.cn"},
        "ccom.edu.cn": {"ccom.edu.cn"},
        "cafa.edu.cn": {"cafa.edu.cn"},
        "bnu.edu.cn": {"bnu.edu.cn"},
        "cup.edu.cn": {"cup.edu.cn"},
        "upc.edu.cn": {"upc.edu.cn"},
        "cug.edu.cn": {"cug.edu.cn"},
        "cugb.edu.cn": {"cugb.edu.cn"},
        "cumt.edu.cn": {"cumt.edu.cn"},
        "cumtb.edu.cn": {"cumtb.edu.cn"},
        "ncepu.edu.cn": {"ncepu.edu.cn"},
    })


def main():
    t0 = time.time()
    patch_special_domains()
    only_new = "--only-new" in sys.argv

    base_all = json.loads(BASE_ALL_PATH.read_text(encoding="utf-8"))
    overrides = {}
    if OVERRIDES_985_PATH.exists():
        overrides.update(json.loads(OVERRIDES_985_PATH.read_text(encoding="utf-8")))
    if OVERRIDES_ALL_PATH.exists():
        overrides.update(json.loads(OVERRIDES_ALL_PATH.read_text(encoding="utf-8")))

    existing_by_name = {}
    if OUT_JSON_PATH.exists():
        try:
            old_data = json.loads(OUT_JSON_PATH.read_text(encoding="utf-8"))
            for u in old_data.get("universities", []):
                existing_by_name[u["name"]] = u
        except Exception:
            pass

    results_by_name = {}
    to_crawl = []
    for s in base_all:
        old = existing_by_name.get(s["name"])
        if only_new and old and old.get("colleges") and len(old["colleges"]) >= 5 and s["name"] not in overrides:
            # Refresh ranking/score/tags/logo metadata cleanly while keeping verified colleges
            old["ranking"] = s["ranking"]
            old["ranking_label"] = s["ranking_label"]
            old["score"] = s["score"]
            old["tags"] = s["tags"]
            old["logo_file"] = s.get("logo_file") or old.get("logo_file", "")
            results_by_name[s["name"]] = old
        elif only_new and old and ("985" in (s.get("tags") or []) or s["name"] == "国防科技大学") and old.get("colleges"):
            old["ranking"] = s["ranking"]
            old["ranking_label"] = s["ranking_label"]
            old["score"] = s["score"]
            old["tags"] = s["tags"]
            results_by_name[s["name"]] = old
        else:
            to_crawl.append(s)

    print(f"Preserved={len(results_by_name)} | Crawling={len(to_crawl)}")

    with ThreadPoolExecutor(max_workers=10) as pool:
        futs = {
            pool.submit(c985.crawl_one_school, s, overrides.get(s["name"], {})): s["name"]
            for s in to_crawl
        }
        for fut in as_completed(futs):
            sname = futs[fut]
            try:
                res = fut.result()
                # Preserve .ac.cn domains in school domains list too
                sroot = overrides.get(sname, {}).get("root_domain") or root_academic_domain(res.get("official_url", ""))
                doms = sorted({
                    d for d in (
                        [sroot] + [root_academic_domain(col["college_url"]) for col in res.get("colleges", [])]
                    ) if d and (".edu.cn" in d or ".ac.cn" in d)
                })
                res["domains"] = doms
                results_by_name[sname] = res
            except Exception as e:
                print(f"FAIL {sname}: {e}")

    results = list(results_by_name.values())
    results.sort(key=lambda x: (x.get("ranking", 9999), -(x.get("score") or -1), x["name"]))

    payload = {
        "version": "2.0.0",
        "tier_scope": "985 / 211 / 双一流",
        "source": "ShanghaiRanking 2026 + University Official Portals",
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_universities": len(results),
        "universities": results,
    }
    OUT_JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        f"Crawl finished in {time.time() - t0:.1f}s | Universities: {len(results)}",
        "-" * 96,
    ]
    need_check = []
    for u in results:
        st = u.get("stats", {})
        c_cnt = st.get("total_colleges", len(u.get("colleges", [])))
        v_cnt = st.get("verified_colleges", 0)
        f_cnt = st.get("faculty_links", 0)
        flag = " [CHECK]" if c_cnt < 6 else ""
        lines.append(
            f"#{str(u.get('ranking_label', '')).rjust(4)} | {u['name']:16s} | "
            f"{'/'.join(u.get('tags', [])):11s} | "
            f"cols={c_cnt:>2} | ver={v_cnt:>2} | fac={f_cnt:>2} | "
            f"grad={bool(u.get('grad_url'))} | entry={u.get('entry_url', '')}{flag}"
        )
        if c_cnt < 6:
            need_check.append((u["name"], u.get("official_url", ""), c_cnt))

    lines.append("-" * 96)
    lines.append(f"Need inspection (<6 colleges): {len(need_check)} -> {[x[0] for x in need_check]}")
    report = "\n".join(lines)
    REPORT_ALL_PATH.write_text(report, encoding="utf-8")
    print(f"REPORT_SAVED: {REPORT_ALL_PATH} | TOTAL={len(results)} | NEED_CHECK={len(need_check)}")
    for nm, uurl, cnt in need_check:
        print(f"  CHECK ({cnt}): {nm} -> {uurl}")


if __name__ == "__main__":
    main()
