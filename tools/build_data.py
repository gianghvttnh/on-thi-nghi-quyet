#!/usr/bin/env python3
"""Đọc mọi file .xlsx trong "Tổng hợp Bộ đề thi/" và sinh docs/data/questions.js.

Mỗi thư mục con = 1 nhóm, mỗi file = 1 bộ đề (tên bộ đề = tên file); file nằm
ngay ở thư mục gốc thuộc nhóm "Khác". Mẫu cột (sheet đầu tiên):
  E = STT câu hỏi, F = Nội dung câu hỏi, G = Đáp án (1-4), H..K = Phương án 1..4
Chỉ dùng thư viện chuẩn Python.
"""
import json
import re
import sys
import unicodedata
import zipfile
from collections import Counter
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Tổng hợp Bộ đề thi"
OUT = ROOT / "docs" / "data" / "questions.js"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def slug(s):
    s = unicodedata.normalize("NFD", s).replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def col_of(ref):
    return re.match(r"[A-Z]+", ref).group(0)


def text_of(si):
    return "".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t"))


def first_sheet_path(z):
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rid = wb.find("m:sheets/m:sheet", NS).get(RNS)
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    for r in rels:
        if r.get("Id") == rid:
            target = r.get("Target").lstrip("/")
            return target if target.startswith("xl/") else "xl/" + target
    return "xl/worksheets/sheet1.xml"


def read_rows(path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            sst = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = [text_of(si) for si in sst.findall("m:si", NS)]
        sheet = ET.fromstring(z.read(first_sheet_path(z)))
    rows = []
    for row in sheet.find("m:sheetData", NS):
        cells = {}
        for c in row.findall("m:c", NS):
            t, v = c.get("t"), c.find("m:v", NS)
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = text_of(c)
            else:
                val = v.text if v is not None else ""
            cells[col_of(c.get("r"))] = unicodedata.normalize("NFC", (val or "").strip())
        rows.append(cells)
    return rows


def to_int(s):
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def build_bank(path, bank_id=None):
    name = unicodedata.normalize("NFC", path.stem)
    bank_id = bank_id or slug(name)
    questions, warnings, seen = [], [], {}
    for i, r in enumerate(read_rows(path)[1:], start=2):
        text = r.get("F", "")
        options = [r.get(c, "") for c in "HIJK"]
        if not text and not any(options):
            continue
        no = to_int(r.get("E")) or len(questions) + 1
        ans = to_int(r.get("G"))
        if not text or not ans or not 1 <= ans <= 4 or not options[ans - 1]:
            warnings.append(f"  ! dòng {i}: thiếu nội dung/đáp án hợp lệ — bỏ qua")
            continue
        opts = [o for o in options if o]
        answer = opts.index(options[ans - 1])
        # Bỏ câu lặp y hệt (cùng nội dung, cùng tập phương án, cùng đáp án)
        key = (text, tuple(sorted(opts)), opts[answer])
        if key in seen:
            warnings.append(f"  - câu {no} trùng câu {seen[key]} — bỏ qua")
            continue
        seen[key] = no
        questions.append({"id": f"{bank_id}-{no}", "no": no, "text": text,
                          "options": opts, "answer": answer})
    return {"id": bank_id, "name": name, "questions": questions}, warnings


def group_of(path):
    rel = path.relative_to(SRC).parts
    return unicodedata.normalize("NFC", rel[0]) if len(rel) > 1 else "Khác"


def main():
    files = [p for p in SRC.rglob("*.xlsx") if not p.name.startswith("~$")]
    if not files:
        sys.exit(f"Không tìm thấy file .xlsx trong {SRC}")
    files.sort(key=lambda p: (group_of(p) == "Khác", group_of(p), p.stem))
    # Giữ id = slug(tên bộ đề) để không mất dữ liệu đã lưu; chỉ thêm tên nhóm khi trùng
    counts = Counter(slug(unicodedata.normalize("NFC", f.stem)) for f in files)
    banks, groups = [], []
    for f in files:
        group = group_of(f)
        sid = slug(unicodedata.normalize("NFC", f.stem))
        bank, warnings = build_bank(f, sid if counts[sid] == 1 else slug(f"{group}-{f.stem}"))
        bank["group"] = group
        if not groups or groups[-1]["name"] != group:
            groups.append({"name": group, "banks": []})
            print(f"[{group}]")
        groups[-1]["banks"].append(bank["id"])
        print(f"  {bank['name']}: {len(bank['questions'])} câu")
        for w in warnings:
            print("  " + w)
        banks.append(bank)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.QUESTION_GROUPS = "
                   + json.dumps(groups, ensure_ascii=False, indent=1) + ";\n"
                   + "window.QUESTION_BANKS = "
                   + json.dumps(banks, ensure_ascii=False, indent=1) + ";\n",
                   encoding="utf-8")
    print(f"Đã ghi {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
