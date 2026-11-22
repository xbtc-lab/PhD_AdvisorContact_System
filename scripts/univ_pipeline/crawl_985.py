# -*- coding: utf-8 -*-
"""
985 University & College Directory Crawler Pipeline (Offline Data Builder)
Builds `data/universities.json` with verified ShanghaiRanking metadata, official URLs,
graduate admissions links, college websites, and secondary "师资队伍/导师" URLs.
"""

import http.client
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIPE_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
BASE_985_PATH = PIPE_DIR / "base_985.json"
OVERRIDES_PATH = PIPE_DIR / "overrides_985.json"
OUT_JSON_PATH = DATA_DIR / "universities.json"
REPORT_PATH = PIPE_DIR / "crawl_report_985.txt"

CTX_UNVERIFIED = ssl._create_unverified_context()
CTX_SECLEVEL1 = ssl._create_unverified_context()
CTX_SECLEVEL1.set_ciphers("DEFAULT:@SECLEVEL=1")

DIRECT_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
DIRECT_UNVERIFIED_OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPSHandler(context=CTX_UNVERIFIED),
)
DIRECT_SECLEVEL1_OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPSHandler(context=CTX_SECLEVEL1),
)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

BLACKLIST_NAME_PATTERNS = [
    r"党政|党委|纪委|监委|监察|巡察|组织部|宣传部|统战部|机关|职能部门|直属单位|直属机构",
    r"教务处|研究生院$|科学技术院$|科学技术发展|社科处|社会科学处|人文社会科学处|科研院$|科研处",
    r"人事处|人力资源|教师工作部|党委教师|离退休|退休|校友|基金|工会|团委|妇委会|学生处|学工部|研工部|招生办|招生办公室|本科生招生|就业指导|创业",
    r"财务处|计财处|审计|招投标|招标|采购|国资|国有资产|资产管理|房产|基建|后勤|保卫|保密|校园规划",
    r"图书馆|档案馆|博物馆|校史馆|美术馆|音乐厅|出版社|杂志社|学报|校报|新闻中心|融媒体",
    r"继续教育|网络教育|远程教育|开放教育|成人教育|职业技术|独立学院|老年大学",
    r"附属中学|附属小学|附中|附小|幼儿园|附属幼儿园|实验学校|校医院",
    r"信息化|网络中心|网络与信息|计算中心|现代教育技术|测试中心|分析测试|实验中心|工程训练中心",
    r"院系设置|学院设置|学部学院|学部与院系|教学机构|教学科研机构|教学单位|机构设置|组织机构|学院导航|更多|详情|English|EN$|首页|返回|查看更多|校际关系|学院速览",
    r"历史沿革|历任领导|前身|原.*大学|原.*学院|含.*学院|大连工学院|华东化工学院|上海化工学院|咸阳师范学院|北洋工学院|麻省理工|以色列理工|校地合作|孔子学院|继续教育学院|网络教育学院|远程教育学院|老年大学",
    r"实验室列表|重点实验室|博士后|国际交流|国际合作|港澳台|留学中心|出国|招生$",
]
BLACKLIST_RE = re.compile("|".join(BLACKLIST_NAME_PATTERNS), re.I)
FACULTY_URL_REJECT_RE = re.compile(r"(rczp|zp\.|zhaopin|zpxx|jyjx\.htm|English|/en/)", re.I)


def fetch_html(url: str, timeout: int = 8) -> tuple[str, str]:
    """Fetches a Chinese university page directly without system proxy and decodes cleanly."""
    final_url, html, _ = fetch_html_with_status(url, timeout=timeout)
    return final_url, html


def fetch_html_with_status(url: str, timeout: int = 8, _hops: int = 0) -> tuple[str, str, int]:
    """Returns (final_url, html_str, http_status) cleanly handling WAF 412, legacy TLS, and light redirects."""
    if not url:
        return "", "", 0
    req_headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    raw = b""
    final_url = url
    status_code = 0
    for attempt in range(2):
        for opener in (DIRECT_OPENER, DIRECT_UNVERIFIED_OPENER, DIRECT_SECLEVEL1_OPENER):
            try:
                req = urllib.request.Request(url, headers=req_headers)
                with opener.open(req, timeout=timeout) as r:
                    status_code = getattr(r, "status", 200) or 200
                    final_url = r.geturl() or url
                    ct = (r.headers.get("Content-Type") or "").lower()
                    if "pdf" in ct or "octet-stream" in ct or "image/" in ct:
                        return final_url, "", status_code
                    try:
                        raw = r.read(1_500_000)
                    except http.client.IncompleteRead as ir:
                        raw = ir.partial or b""
                    break
            except urllib.error.HTTPError as he:
                status_code = he.code
                if he.code in (403, 412):
                    return url, "", he.code
            except Exception:
                pass
        if raw:
            break
        time.sleep(0.35)
    if not raw:
        return final_url, "", status_code

    enc = "utf-8"
    head_ascii = raw[:4096].decode("ascii", errors="ignore")
    m = re.search(r'charset=["\']?\s*([a-zA-Z0-9_-]+)', head_ascii, re.I)
    if m:
        cand = m.group(1).lower()
        if cand in ("gb2312", "gbk", "gb18030"):
            enc = "gb18030"
        elif "utf" in cand:
            enc = "utf-8"
    try:
        html = raw.decode(enc)
    except Exception:
        html = raw.decode("utf-8", errors="replace")

    if _hops < 1 and len(html) < 2800:
        m_meta = re.search(r'http-equiv=["\']refresh["\'][^>]*content=["\'][^"\']*url=([^"\'>;\s]+)', html, re.I)
        m_js = re.search(r'(?:window\.)?location(?:\.href)?\s*=\s*["\']([^"\']+)["\']|location\.replace\(\s*["\']([^"\']+)["\']', html, re.I)
        target = (m_meta.group(1) if m_meta else (m_js.group(1) or m_js.group(2) if m_js else "")).strip()
        if target and not target.startswith(("javascript:", "#")):
            next_u = urllib.parse.urljoin(final_url, target)
            if next_u != final_url:
                return fetch_html_with_status(next_u, timeout=timeout, _hops=_hops + 1)

    return final_url, html, status_code


FACULTY_TIER1 = [
    ("博士生导师", 100),
    ("博导名录", 98),
    ("博导风采", 96),
    ("博导介绍", 95),
    ("研究生导师", 94),
    ("导师名录", 93),
    ("导师队伍", 92),
    ("导师风采", 90),
    ("导师介绍", 89),
    ("导师团队", 88),
    ("博导", 85),
]
FACULTY_TIER2 = [
    ("师资队伍", 80),
    ("专任教师", 78),
    ("教师名录", 77),
    ("教师队伍", 76),
    ("教学科研人员", 75),
    ("在职教师", 74),
    ("教师团队", 73),
    ("教师信息", 72),
    ("师资力量", 68),
    ("人才队伍", 65),
    ("师资概况", 62),
    ("Faculty", 60),
    ("People", 52),
    ("师资", 50),
]
FACULTY_REJECT_RE = re.compile(r"招聘|引进|博士后招|诚聘|人才计划|通知|公告|招生|简介$|English|新闻", re.I)


class StructuredLinkParser(HTMLParser):
    """Extracts <a> links along with their nearest heading context."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[dict] = []
        self._in_a = False
        self._a_href = ""
        self._a_title = ""
        self._a_buf: list[str] = []
        self._in_heading = False
        self._h_buf: list[str] = []
        self._current_heading = ""
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in ("script", "style", "noscript"):
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        attr_map = {k.lower(): (v or "") for k, v in attrs}
        if t in ("h1", "h2", "h3", "h4", "dt"):
            self._in_heading = True
            self._h_buf = []
        elif t == "div":
            cls = attr_map.get("class", "").lower()
            if any(k in cls for k in ("title", "head", "hd", "section-name", "tit")):
                self._in_heading = True
                self._h_buf = []
        elif t == "a":
            href = (attr_map.get("href") or "").strip()
            if href and not href.startswith(("javascript:", "mailto:", "tel:", "#")):
                self._in_a = True
                self._a_href = href
                self._a_title = (attr_map.get("title") or "").strip()
                self._a_buf = []

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in ("script", "style", "noscript"):
            if self._skip_depth > 0:
                self._skip_depth -= 1
            return
        if self._in_heading and t in ("h1", "h2", "h3", "h4", "dt", "div"):
            htext = re.sub(r"\s+", " ", "".join(self._h_buf)).strip()
            if 2 <= len(htext) <= 30:
                self._current_heading = htext
            self._in_heading = False
            self._h_buf = []
        if t == "a" and self._in_a:
            txt = re.sub(r"\s+", " ", "".join(self._a_buf)).strip()
            if not txt and self._a_title:
                txt = self._a_title
            if txt:
                self.links.append({
                    "href": self._a_href,
                    "text": txt,
                    "title": self._a_title,
                    "heading": self._current_heading,
                })
            self._in_a = False
            self._a_buf = []

    def handle_data(self, data):
        if self._skip_depth:
            return
        if self._in_a:
            self._a_buf.append(data)
        if self._in_heading:
            self._h_buf.append(data)


def parse_links(html: str, base_url: str) -> list[dict]:
    clean_html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html or "", flags=re.S | re.I)
    parser = StructuredLinkParser()
    try:
        parser.feed(clean_html)
    except Exception:
        pass

    raw_items = list(parser.links)
    # Regex fallbacks for SVG-wrapped <a>, atr-href widgets, table-row name+url, and <h2>+<a> cards
    for href, inner in re.findall(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', clean_html, re.S | re.I):
        if href.startswith(("javascript:", "mailto:", "tel:", "#")):
            continue
        txt = re.sub(r"<[^>]+>|\s+", " ", inner).strip()
        if txt:
            raw_items.append({"href": href, "text": txt, "title": "", "heading": ""})

    for href, inner in re.findall(r'atr-href=["\']([^"\']+)["\'][^>]*>([^<]{2,40})<', clean_html, re.I):
        raw_items.append({"href": href, "text": inner.strip(), "title": "", "heading": ""})

    for tr_inner in re.findall(r'<tr[^>]*>(.*?)</tr>', clean_html, re.S | re.I):
        tds = re.findall(r'<td[^>]*>(.*?)</td>', tr_inner, re.S | re.I)
        if len(tds) >= 2:
            name_plain = re.sub(r"<[^>]+>|\s+", " ", tds[0]).strip()
            m_href = re.search(r'href=["\']([^"\']+)["\']', " ".join(tds[1:]), re.I)
            if name_plain and m_href and 2 <= len(name_plain) <= 32:
                raw_items.append({"href": m_href.group(1), "text": name_plain, "title": "", "heading": ""})

    for h_txt, href in re.findall(r'<h[234][^>]*>\s*([^<]{2,32})\s*</h[234]>\s*(?:<[^>]+>\s*){0,3}<a\b[^>]*href=["\']([^"\']+)["\']', clean_html, re.S | re.I):
        raw_items.append({"href": href, "text": h_txt.strip(), "title": "", "heading": ""})

    out = []
    seen = set()
    for item in raw_items:
        abs_url = urllib.parse.urljoin(base_url, item["href"]).split("#")[0].strip()
        if not abs_url.startswith(("http://", "https://")):
            continue
        if any(abs_url.lower().endswith(ext) for ext in (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".rar", ".jpg", ".png")):
            continue
        key = (item["text"], abs_url)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "url": abs_url,
            "text": item["text"],
            "heading": item["heading"],
        })
    return out


def root_edu_domain(url: str) -> str:
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    parts = host.split(".")
    if len(parts) >= 3 and host.endswith(".edu.cn"):
        return ".".join(parts[-3:])
    return host


KNOWN_ALIAS_DOMAINS = {
    "pku.edu.cn": {"bjmu.edu.cn"},
    "fudan.edu.cn": {"shmc.edu.cn", "fudan.edu.cn"},
    "sjtu.edu.cn": {"shsmu.edu.cn", "sjtu.edu.cn"},
    "zju.edu.cn": {"zju.edu.cn"},
    "nwafu.edu.cn": {"nwsuaf.edu.cn", "nwafu.edu.cn"},
    "nwsuaf.edu.cn": {"nwafu.edu.cn", "nwsuaf.edu.cn"},
    "mail.sysu.edu.cn": {"sysu.edu.cn"},
    "sysu.edu.cn": {"mail.sysu.edu.cn"},
}


def same_university_domain(link_url: str, school_root: str) -> bool:
    d = root_edu_domain(link_url)
    if not d or not school_root:
        return False
    if d == school_root or d.endswith("." + school_root):
        return True
    return d in KNOWN_ALIAS_DOMAINS.get(school_root, set())


def is_valid_college_name(name: str, heading: str = "") -> bool:
    s = re.sub(r"[\s\u3000]+", "", name)
    if len(s) < 2 or len(s) > 36:
        return False
    if BLACKLIST_RE.search(s):
        return False
    if any(k in (heading or "") for k in ("党政", "职能部门", "管理服务", "后勤", "群团", "附中")):
        if not any(k in (heading or "") for k in ("教学", "科研", "院系", "学部")):
            if not re.search(r"(学院|学部)$", s):
                return False
    # Strong academic naming rules
    if re.search(r"(学院|学部|书院|学堂)$", s):
        return True
    if re.search(r"(学院|学部|书院|学堂)[（(]", s):
        return True
    if re.search(r"(研究院|研究总院|医学中心)$", s) and not re.search(r"^(科学技术|社会科学|人文社会|发展规划|招生|政策)", s):
        return True
    if re.search(r"^(中文|数学|物理|化学|天文|哲学|历史|考古|社会|心理学?|外语|英语|法学?|经济|金融|建筑|土木|机械|能源|电气|电子|信息|计算机|生命科学|生物|地球|环境|海洋|艺术|马克思主义|体育|统计|新闻).*系$", s):
        return True
    if re.search(r"[\u4e00-\u9fa5]{2,}(学院|学部)$", s):
        return True
    if re.search(r"[\u4e00-\u9fa5]{2,10}系$", s) and not re.search(r"(关系|体系|联系|院系|系列)", s):
        return True
    return False


DISCIPLINE_RULES = [
    ("人文社科", r"文学院|人文|历史|哲学|国学|中文|中国语言|新闻|传播|新媒体|外国语|外语|国际教育|海外教育|艺术|音乐|美术|戏剧|电影|影视|教育|体育|马克思主义|社会学|心理|民族|考古|文博|汉语"),
    ("经管法政", r"经济|金融|管理|商学院|工商|光华|经管|会计|财税|财政|法学院|知识产权|政治|国际关系|国际问题|公共管理|政府管理|公共事务|行政|外交|MPA|MBA"),
    ("信息与AI", r"计算机|软件|人工智能|智能|大数据|数据科学|网络空间|信息安全|密码|电子信息|微电子|集成电路|通信|信息工程|自动化|控制|光电|仪器|物联网|计算"),
    ("理学基础", r"数学|物理|化学|统计|天文|空间科学|地球|地质|气象|大气|海洋|水文|测绘|遥感|地理|力学"),
    ("工程技术", r"机械|动力|能源|电气|土木|水利|建筑|城市规划|城乡规划|交通|道路|桥梁|航空|航天|宇航|飞行器|材料|化工|化学工程|冶金|矿业|资源|安全|环境|生态|船舶|海工|纺织|轻工|核科学|核工程|光学"),
    ("生命农医", r"生命|生物|医学|口腔|药学|基础医学|临床|公共卫生|护理|康复|中医药|农业|农学院|园艺|植物|动物|兽医|林学|草业|食品|水产|茶学|蚕学"),
    ("前沿交叉", r"前沿|交叉|未来技术|卓越工程师|高等研究院|元培|致远|竺可桢|吴健雄|匡亚明|启真|弘深|书院|创新创业|国际联合"),
]


def classify_disciplines(name: str) -> list[str]:
    tags = [label for label, pat in DISCIPLINE_RULES if re.search(pat, name, re.I)]
    return tags[:2] if tags else ["综合学科"]


def find_best_grad_url(links: list[dict], school_root: str) -> str:
    best_url = ""
    best_score = -1
    for lk in links:
        if not same_university_domain(lk["url"], school_root):
            continue
        t = lk["text"]
        u = lk["url"].lower()
        sc = 0
        if "研究生招生" in t or "研招" in t:
            sc = 100
        elif "研究生院" in t:
            sc = 90
        elif "研究生教育" in t:
            sc = 80
        elif "graduate" in u or "yz." in u or "gs." in u or "grs." in u or "yjs" in u:
            if "研究生" in t or "grad" in u:
                sc = 70
        if sc > best_score:
            best_score = sc
            best_url = lk["url"]
    return best_url


def find_yxsz_candidates(links: list[dict], school_root: str) -> list[str]:
    scored = []
    for lk in links:
        if not same_university_domain(lk["url"], school_root):
            continue
        t = lk["text"].strip()
        u = lk["url"].lower()
        sc = 0
        if t in ("院系", "院系设置", "学院设置", "学院部门", "教学科研机构", "学部院系", "学部与院系", "院部设置", "学院部所", "教学和科研单位", "院系介绍", "二级学院", "学院导航", "学部学院", "院所设置", "院系中心", "院系专业", "学院（研究院）"):
            sc = 110
        elif any(k in t for k in ("教学科研机构", "院系设置", "学部院系", "学部与院系", "学院设置", "教学单位", "院系导航", "教学科研单位", "教学机构", "学院部门", "院部设置", "学院部所", "二级学院", "学部学院", "院所设置", "院系部所")):
            sc = 100
        elif any(k in t for k in ("机构设置", "学校机构", "组织机构", "院系部门", "学院介绍")):
            sc = 80
        elif any(k in u for k in ("yxsz", "xybm", "jxky", "jxjg", "jxdw", "xysz", "ybsz", "ejxy", "xyxb", "jgsz", "listcolleage")):
            sc = 75
        if sc > 0:
            scored.append((sc, lk["url"]))
    scored.sort(key=lambda x: x[0], reverse=True)
    uniq = []
    for _, u in scored:
        if u not in uniq:
            uniq.append(u)
    return uniq[:4]


def extract_colleges_from_links(links: list[dict], school_root: str, school_home: str) -> list[dict]:
    colleges = []
    seen_names = set()
    seen_urls = set()
    home_norm = school_home.rstrip("/")
    for lk in links:
        u = lk["url"]
        if not same_university_domain(u, school_root):
            continue
        if u.rstrip("/") == home_norm:
            continue
        name = re.sub(r"^[\ue000-\uf8ff◆◇●•·■▶►\s]+", "", lk["text"]).strip()
        name = re.sub(r"^\d+[\.、\s]+", "", name).strip()
        name = re.sub(r"\s*/\s*(?=[A-Za-z]).*$", "", name).strip()
        name = re.sub(r"[→>、，,;；]+$", "", name).strip()
        if not is_valid_college_name(name, lk.get("heading", "")):
            continue
        if name in seen_names or u in seen_urls:
            continue
        seen_names.add(name)
        seen_urls.add(u)
        colleges.append({
            "name": name,
            "college_url": u,
            "faculty_url": "",
            "discipline_tags": classify_disciplines(name),
            "status": "pending",
        })
    return colleges


def detect_faculty_url(college: dict, school_root: str) -> dict:
    url = college["college_url"]
    final_url, html, status_code = fetch_html_with_status(url, timeout=7)
    if not html and status_code not in (403, 412) and url.startswith("http://"):
        final_url, html, status_code = fetch_html_with_status("https://" + url[7:], timeout=6)
    if not html:
        if status_code in (403, 412):
            college["status"] = "waf_protected"
        else:
            college["status"] = "unreachable"
        return college

    college["college_url"] = final_url or url
    college["status"] = "verified"

    links = parse_links(html, college["college_url"])
    best_url = ""
    best_score = -1
    for lk in links:
        t = lk["text"].strip()
        u = lk["url"]
        if not same_university_domain(u, school_root):
            continue
        if len(t) > 20 or FACULTY_REJECT_RE.search(t) or FACULTY_URL_REJECT_RE.search(u):
            continue
        sc = -1
        for kw, base_sc in FACULTY_TIER1:
            if kw == t:
                sc = base_sc + 10
                break
            if kw in t:
                sc = max(sc, base_sc)
        if sc < 0:
            for kw, base_sc in FACULTY_TIER2:
                if kw == t:
                    sc = base_sc + 8
                    break
                if kw in t:
                    sc = max(sc, base_sc)
        if sc < 0:
            lu = u.lower()
            if any(seg in lu for seg in ("/szdw", "/szll", "/jsml", "/dsjs", "/bdml", "/faculty")):
                sc = 45
        if sc > best_score:
            best_score = sc
            best_url = u

    college["faculty_url"] = best_url
    return college


def extract_zju_js_colleges(url: str) -> list[dict]:
    _, html = fetch_html(url, timeout=10)
    pairs = re.findall(r"title:\s*'([^']+)'\s*,\s*link:\s*'([^']+)'", html)
    out = []
    seen = set()
    for title, link in pairs:
        nm = title.strip()
        if not is_valid_college_name(nm):
            continue
        if not link.startswith("http"):
            continue
        if nm in seen:
            continue
        seen.add(nm)
        out.append({
            "name": nm,
            "college_url": link,
            "faculty_url": "",
            "discipline_tags": classify_disciplines(nm),
            "status": "pending",
        })
    return out


def extract_sjtu_js_colleges(url: str) -> list[dict]:
    _, js = fetch_html(url, timeout=10)
    raw = re.findall(r'href=["\']([^"\']+)["\'][^>]*>([^<]{2,32})<', js)
    out = []
    seen = set()
    for href, txt in raw:
        nm = txt.strip()
        abs_u = urllib.parse.urljoin("https://www.sjtu.edu.cn/", href)
        if not same_university_domain(abs_u, "sjtu.edu.cn"):
            continue
        if not is_valid_college_name(nm):
            continue
        if nm in seen:
            continue
        seen.add(nm)
        out.append({
            "name": nm,
            "college_url": abs_u,
            "faculty_url": "",
            "discipline_tags": classify_disciplines(nm),
            "status": "pending",
        })
    return out


def crawl_one_school(school: dict, override: dict) -> dict:
    official_url = (override.get("official_url") or school.get("official_url") or "").strip()
    final_home, home_html, _ = fetch_html_with_status(official_url, timeout=10)
    if not home_html and official_url.startswith("http://"):
        final_home, home_html, _ = fetch_html_with_status("https://" + official_url[7:], timeout=8)

    if final_home:
        official_url = final_home
    sroot = override.get("root_domain") or root_edu_domain(official_url)

    home_links = parse_links(home_html, official_url) if home_html else []
    grad_url = override.get("grad_url") or find_best_grad_url(home_links, sroot)

    colleges = []
    best_entry = override.get("entry_url_display") or ""

    if override.get("zju_js_entry"):
        colleges = extract_zju_js_colleges(override["zju_js_entry"])
        best_entry = override["zju_js_entry"]
    elif override.get("sjtu_js_entry"):
        colleges = extract_sjtu_js_colleges(override["sjtu_js_entry"])
        best_entry = override["sjtu_js_entry"]
    elif override.get("combine_entries"):
        seen_names = set()
        for eu in override["combine_entries"]:
            f_eu, e_html, _ = fetch_html_with_status(eu, timeout=10)
            if not e_html:
                continue
            cand = extract_colleges_from_links(parse_links(e_html, f_eu or eu), sroot, official_url)
            for item in cand:
                if item["name"] not in seen_names:
                    seen_names.add(item["name"])
                    colleges.append(item)
        best_entry = override["combine_entries"][0]
    elif override.get("manual_colleges") and not override.get("entry_urls"):
        colleges = []
    else:
        entry_urls = list(override.get("entry_urls") or [])
        if not entry_urls:
            entry_urls = find_yxsz_candidates(home_links, sroot)
        for eu in entry_urls:
            f_eu, e_html, _ = fetch_html_with_status(eu, timeout=10)
            if not e_html:
                continue
            e_links = parse_links(e_html, f_eu or eu)
            cand = extract_colleges_from_links(e_links, sroot, official_url)
            if len(cand) > len(colleges):
                colleges = cand
                best_entry = f_eu or eu
            if len(colleges) >= 15:
                break
        if len(colleges) < 10 and home_links:
            home_cand = extract_colleges_from_links(home_links, sroot, official_url)
            if len(home_cand) > len(colleges):
                colleges = home_cand
                best_entry = official_url

    if override.get("manual_colleges"):
        existing_names = {c["name"] for c in colleges}
        for mc in override["manual_colleges"]:
            if mc["name"] not in existing_names:
                colleges.append({
                    "name": mc["name"],
                    "college_url": mc["college_url"],
                    "faculty_url": mc.get("faculty_url", ""),
                    "discipline_tags": mc.get("discipline_tags") or classify_disciplines(mc["name"]),
                    "status": "pending",
                })

    with ThreadPoolExecutor(max_workers=12) as pool:
        colleges = list(pool.map(lambda c: detect_faculty_url(c, sroot), colleges))

    verified_cnt = sum(1 for c in colleges if c["status"] in ("verified", "waf_protected"))
    faculty_cnt = sum(1 for c in colleges if c.get("faculty_url"))
    domains = sorted({
        d for d in (
            [sroot] + [root_edu_domain(c["college_url"]) for c in colleges]
        ) if d and ".edu.cn" in d
    })

    return {
        "id": school["id"],
        "name": school["name"],
        "full_name": school.get("full_name") or school["name"],
        "name_en": school.get("name_en") or "",
        "province": school.get("province") or "",
        "city": school.get("city") or "",
        "category": school.get("category") or "综合",
        "admin_type": school.get("admin_type") or "",
        "tags": school.get("tags") or ["双一流", "985", "211"],
        "ranking": school.get("ranking", 999),
        "ranking_label": str(school.get("ranking_label") or ""),
        "score": school.get("score"),
        "logo_file": school.get("logo_file") or "",
        "official_url": official_url,
        "grad_url": grad_url,
        "faculty_portal": override.get("faculty_portal") or "",
        "entry_url": best_entry,
        "domains": domains,
        "colleges": colleges,
        "stats": {
            "total_colleges": len(colleges),
            "verified_colleges": verified_cnt,
            "faculty_links": faculty_cnt,
        },
    }


def main():
    t0 = time.time()
    schools = json.loads(BASE_985_PATH.read_text(encoding="utf-8"))
    overrides = {}
    if OVERRIDES_PATH.exists():
        overrides = json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {
            pool.submit(crawl_one_school, s, overrides.get(s["name"], {})): s["name"]
            for s in schools
        }
        for fut in as_completed(futs):
            sname = futs[fut]
            try:
                results.append(fut.result())
            except Exception as e:
                print(f"SCHOOL_FAIL {sname}: {e}")

    results.sort(key=lambda x: (x["ranking"], x["name"]))
    payload = {
        "version": "1.0.0",
        "tier_scope": "985",
        "source": "ShanghaiRanking 2026 + University Official Portals",
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_universities": len(results),
        "universities": results,
    }
    OUT_JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        f"Crawl finished in {time.time() - t0:.1f}s | Universities: {len(results)}",
        "-" * 92,
    ]
    low_count = []
    for u in results:
        st = u["stats"]
        flag = " [CHECK]" if st["total_colleges"] < 10 else ""
        line = (
            f"#{u['ranking_label']:>4} | {u['name']:10s} | "
            f"colleges={st['total_colleges']:>2} | verified={st['verified_colleges']:>2} | "
            f"faculty={st['faculty_links']:>2} | grad={bool(u['grad_url'])} | "
            f"entry={u['entry_url']}{flag}"
        )
        lines.append(line)
        if st["total_colleges"] < 10:
            low_count.append(u["name"])

    lines.append("-" * 92)
    lines.append(f"Need inspection (<10 colleges): {len(low_count)} -> {low_count}")
    report = "\n".join(lines)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
