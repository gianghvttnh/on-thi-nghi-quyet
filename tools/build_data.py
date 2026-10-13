#!/usr/bin/env python3
"""Đọc mọi file .xlsx trong "Tổng hợp Bộ đề thi/" và sinh docs/data/questions.js.

Mỗi file = 1 bộ đề (tên bộ đề = tên file). Mẫu cột (sheet đầu tiên):
  E = STT câu hỏi, F = Nội dung câu hỏi, G = Đáp án (1-4), H..K = Phương án 1..4
Chỉ dùng thư viện chuẩn Python.
"""
import json
import re
import sys
import unicodedata
import zipfile
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
            cells[col_of(c.get("r"))] = (val or "").strip()
        rows.append(cells)
    return rows


def to_int(s):
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def build_bank(path):
    name = path.stem
    bank_id = slug(name)
    questions, warnings = [], []
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
        questions.append({"id": f"{bank_id}-{no}", "no": no, "text": text,
                          "options": opts, "answer": answer})
    return {"id": bank_id, "name": name, "questions": questions}, warnings


def main():
    files = sorted(p for p in SRC.glob("*.xlsx") if not p.name.startswith("~$"))
    if not files:
        sys.exit(f"Không tìm thấy file .xlsx trong {SRC}")
    banks = []
    for f in files:
        bank, warnings = build_bank(f)
        print(f"{bank['name']}: {len(bank['questions'])} câu")
        for w in warnings:
            print(w)
        banks.append(bank)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.QUESTION_BANKS = "
                   + json.dumps(banks, ensure_ascii=False, indent=1) + ";\n",
                   encoding="utf-8")
    print(f"Đã ghi {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
