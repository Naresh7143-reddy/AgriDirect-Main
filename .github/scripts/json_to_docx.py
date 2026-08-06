#!/usr/bin/env python3
"""
Converts test execution JSON data into styled Microsoft Word (.docx) documents.
Supports JUnit, Jest/Vitest, Load Testing, and Appium report JSON structures.

Usage:
  py .github/scripts/json_to_docx.py <input-json-path> <suite-title> <output-docx-path>
"""
import sys
import os
import json
from datetime import datetime
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, hex_color):
    """Sets background shading color for a table cell."""
    tcPr = cell._element.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Sets cell padding in dxa (1 pt = 20 dxa)."""
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)

def create_word_report(json_path, suite_title, output_docx_path):
    if not os.path.isfile(json_path):
        print(f"Warning: JSON input path '{json_path}' does not exist.")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    doc = Document()

    # Set page margins (0.75 in)
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)

    # ── Color Palette ────────────────────────────────────────────────────────
    PRIMARY_COLOR = RGBColor(27, 94, 32)     # #1B5E20 Dark Green
    PASSED_COLOR  = RGBColor(46, 125, 50)    # #2E7D32 Green
    FAILED_COLOR  = RGBColor(198, 40, 40)    # #C62828 Red
    SKIPPED_COLOR = RGBColor(230, 81, 0)     # #E65100 Orange
    GRAY_COLOR    = RGBColor(69, 90, 100)    # #455A64 Slate Gray

    HEX_PRIMARY    = "1B5E20"
    HEX_LIGHT_BG   = "F5F7F8"
    HEX_PASS_BG    = "E8F5E9"
    HEX_FAIL_BG    = "FFEBEE"
    HEX_SKIP_BG    = "FFF3E0"
    HEX_BORDER     = "CFD8DC"

    # Extract test metrics
    cases = data.get("cases", data.get("allTests", data.get("results", [])))
    total = data.get("total", len(cases))
    passed = data.get("passed", sum(1 for c in cases if c.get("status") == "passed" or c.get("state") == "passed" or c.get("ok")))
    failed = data.get("failed", sum(1 for c in cases if c.get("status") == "failed" or c.get("state") == "failed" or (isinstance(c.get("ok"), bool) and not c.get("ok"))))
    skipped = data.get("skipped", sum(1 for c in cases if c.get("status") in ["skipped", "pending"] or c.get("state") in ["skipped", "pending"]))
    
    pass_rate = (passed / total * 100) if total > 0 else 0.0

    # ── Document Title Header ────────────────────────────────────────────────
    title_p = doc.add_paragraph()
    title_run = title_p.add_run(f"AgriDirect Test Report — {suite_title}")
    title_run.font.name = "Calibri"
    title_run.font.size = Pt(22)
    title_run.font.bold = True
    title_run.font.color.rgb = PRIMARY_COLOR
    title_p.paragraph_format.space_after = Pt(2)

    sub_p = doc.add_paragraph()
    sub_run = sub_p.add_run(f"Automated Test Execution Summary  |  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    sub_run.font.name = "Calibri"
    sub_run.font.size = Pt(10)
    sub_run.font.italic = True
    sub_run.font.color.rgb = GRAY_COLOR
    sub_p.paragraph_format.space_after = Pt(16)

    # ── KPI Summary Cards Table ─────────────────────────────────────────────
    kpi_table = doc.add_table(rows=2, cols=4)
    kpi_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    kpi_table.autofit = False

    kpi_labels = ["Total Tests", "Passed", "Failed", "Pass Rate"]
    kpi_values = [str(total), str(passed), str(failed), f"{pass_rate:.1f}%"]
    kpi_colors = [GRAY_COLOR, PASSED_COLOR, FAILED_COLOR, (PASSED_COLOR if pass_rate >= 80 else FAILED_COLOR)]
    kpi_bgs    = [HEX_LIGHT_BG, HEX_PASS_BG, HEX_FAIL_BG, (HEX_PASS_BG if pass_rate >= 80 else HEX_FAIL_BG)]

    for col_idx in range(4):
        # Value row (row 0)
        cell_val = kpi_table.cell(0, col_idx)
        cell_val.width = Inches(1.6)
        set_cell_background(cell_val, kpi_bgs[col_idx])
        set_cell_margins(cell_val, top=120, bottom=40, left=100, right=100)
        p = cell_val.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(kpi_values[col_idx])
        run.font.name = "Calibri"
        run.font.size = Pt(20)
        run.font.bold = True
        run.font.color.rgb = kpi_colors[col_idx]
        p.paragraph_format.space_after = Pt(0)

        # Label row (row 1)
        cell_lbl = kpi_table.cell(1, col_idx)
        cell_lbl.width = Inches(1.6)
        set_cell_background(cell_lbl, kpi_bgs[col_idx])
        set_cell_margins(cell_lbl, top=0, bottom=120, left=100, right=100)
        p2 = cell_lbl.paragraphs[0]
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run2 = p2.add_run(kpi_labels[col_idx])
        run2.font.name = "Calibri"
        run2.font.size = Pt(9)
        run2.font.bold = True
        run2.font.color.rgb = GRAY_COLOR
        p2.paragraph_format.space_after = Pt(0)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # ── Recommendation Banner ───────────────────────────────────────────────
    rec_p = doc.add_paragraph()
    rec_p.paragraph_format.space_before = Pt(8)
    rec_p.paragraph_format.space_after = Pt(16)
    
    if pass_rate >= 90:
        status_text = "PASSED — RELEASE RECOMMENDED"
        status_color = PASSED_COLOR
    elif pass_rate >= 70:
        status_text = "WARNING — RELEASE WITH CAUTION"
        status_color = SKIPPED_COLOR
    else:
        status_text = "FAILED — DO NOT RELEASE"
        status_color = FAILED_COLOR

    rec_run = rec_p.add_run(f"Execution Verdict: {status_text}")
    rec_run.font.name = "Calibri"
    rec_run.font.size = Pt(13)
    rec_run.font.bold = True
    rec_run.font.color.rgb = status_color

    # ── Test Execution Detail Table ──────────────────────────────────────────
    heading_p = doc.add_paragraph()
    h_run = heading_p.add_run("Detailed Test Case Execution Results")
    h_run.font.name = "Calibri"
    h_run.font.size = Pt(14)
    h_run.font.bold = True
    h_run.font.color.rgb = PRIMARY_COLOR
    heading_p.paragraph_format.space_after = Pt(8)

    detail_table = doc.add_table(rows=1, cols=4)
    detail_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    detail_table.autofit = False

    # Header Row
    headers = ["#", "Test Case Description", "Status", "Duration / Detail"]
    widths  = [Inches(0.5), Inches(3.8), Inches(1.2), Inches(1.5)]

    hdr_cells = detail_table.rows[0].cells
    for i in range(4):
        hdr_cells[i].width = widths[i]
        set_cell_background(hdr_cells[i], HEX_PRIMARY)
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=100, right=100)
        p = hdr_cells[i].paragraphs[0]
        if i in [0, 2]:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(headers[i])
        run.font.name = "Calibri"
        run.font.size = Pt(10)
        run.font.bold = True
        run.font.color.rgb = RGBColor(255, 255, 255)
        p.paragraph_format.space_after = Pt(0)

    # Populate Test Cases
    for idx, c in enumerate(cases, 1):
        row_cells = detail_table.add_row().cells

        name = c.get("name", c.get("title", c.get("test", f"Test Case #{idx}")))
        status = c.get("status", c.get("state", "passed" if c.get("ok") else "failed"))
        if isinstance(status, bool):
            status = "passed" if status else "failed"

        dur = c.get("duration", 0)
        if isinstance(dur, (int, float)):
            dur_str = f"{dur/1000:.2f}s" if dur > 10 else f"{dur}ms"
        else:
            dur_str = str(dur)

        err_msg = c.get("message", c.get("error", ""))
        if isinstance(err_msg, dict):
            err_msg = err_msg.get("message", "")

        status_upper = str(status).upper()
        if status_upper in ["PASSED", "PASS", "TRUE"]:
            bg = HEX_PASS_BG
            status_color = PASSED_COLOR
            status_text = "✅ PASSED"
        elif status_upper in ["FAILED", "FAIL", "FALSE"]:
            bg = HEX_FAIL_BG
            status_color = FAILED_COLOR
            status_text = "❌ FAILED"
        else:
            bg = HEX_SKIP_BG
            status_color = SKIPPED_COLOR
            status_text = "⏭️ SKIPPED"

        # Cell 0: Index
        row_cells[0].width = widths[0]
        set_cell_background(row_cells[0], bg)
        set_cell_margins(row_cells[0], top=80, bottom=80, left=100, right=100)
        p0 = row_cells[0].paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r0 = p0.add_run(str(idx))
        r0.font.name = "Calibri"
        r0.font.size = Pt(9.5)

        # Cell 1: Test Name + Error message if any
        row_cells[1].width = widths[1]
        set_cell_background(row_cells[1], bg)
        set_cell_margins(row_cells[1], top=80, bottom=80, left=100, right=100)
        p1 = row_cells[1].paragraphs[0]
        r1 = p1.add_run(name)
        r1.font.name = "Calibri"
        r1.font.size = Pt(9.5)
        r1.font.bold = True

        if err_msg:
            p1_err = row_cells[1].add_paragraph()
            r1_err = p1_err.add_run(f"Error: {err_msg[:200]}")
            r1_err.font.name = "Calibri"
            r1_err.font.size = Pt(8.5)
            r1_err.font.italic = True
            r1_err.font.color.rgb = FAILED_COLOR

        # Cell 2: Status
        row_cells[2].width = widths[2]
        set_cell_background(row_cells[2], bg)
        set_cell_margins(row_cells[2], top=80, bottom=80, left=100, right=100)
        p2 = row_cells[2].paragraphs[0]
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r2 = p2.add_run(status_text)
        r2.font.name = "Calibri"
        r2.font.size = Pt(9.5)
        r2.font.bold = True
        r2.font.color.rgb = status_color

        # Cell 3: Duration
        row_cells[3].width = widths[3]
        set_cell_background(row_cells[3], bg)
        set_cell_margins(row_cells[3], top=80, bottom=80, left=100, right=100)
        p3 = row_cells[3].paragraphs[0]
        r3 = p3.add_run(dur_str)
        r3.font.name = "Calibri"
        r3.font.size = Pt(9)
        r3.font.color.rgb = GRAY_COLOR

    # Save document
    os.makedirs(os.path.dirname(os.path.abspath(output_docx_path)), exist_ok=True)
    doc.save(output_docx_path)
    print(f"Successfully generated Word report: {output_docx_path}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: json_to_docx.py <input-json> <suite-title> <output-docx>")
        sys.exit(1)

    json_input, title_arg, docx_output = sys.argv[1], sys.argv[2], sys.argv[3]
    create_word_report(json_input, title_arg, docx_output)
