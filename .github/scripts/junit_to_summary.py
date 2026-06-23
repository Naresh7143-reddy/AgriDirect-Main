#!/usr/bin/env python3
"""Parse a JUnit XML report into GITHUB_OUTPUT totals + a per-test-case
markdown table appended to GITHUB_STEP_SUMMARY, plus a JSON file the
master-report job can merge into the final dashboard.

Usage: junit_to_summary.py <junit.xml> <suite-title> <json-out-path>
"""
import os
import sys
import json
import glob
import xml.etree.ElementTree as ET


def parse_file(xml_path, cases):
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        for tc in root.iter("testcase"):
            name = tc.get("name", "unknown")
            classname = tc.get("classname", "")
            duration = float(tc.get("time", 0) or 0)
            failure = tc.find("failure")
            error = tc.find("error")
            skipped = tc.find("skipped")
            if failure is not None or error is not None:
                status = "failed"
                msg = (failure.get("message") if failure is not None else error.get("message")) or ""
            elif skipped is not None:
                status = "skipped"
                msg = skipped.get("message", "") or ""
            else:
                status = "passed"
                msg = ""
            cases.append({
                "name": name,
                "classname": classname,
                "status": status,
                "duration": duration,
                "message": msg[:200],
            })
    except ET.ParseError as e:
        print(f"::warning::Could not parse {xml_path}: {e}")


def main():
    xml_pattern, title, json_out = sys.argv[1], sys.argv[2], sys.argv[3]

    cases = []
    paths = glob.glob(xml_pattern) if any(c in xml_pattern for c in "*?[") else (
        [xml_pattern] if os.path.isfile(xml_pattern) else []
    )
    for p in sorted(paths):
        parse_file(p, cases)

    total = len(cases)
    passed = sum(1 for c in cases if c["status"] == "passed")
    failed = sum(1 for c in cases if c["status"] == "failed")
    skipped = sum(1 for c in cases if c["status"] == "skipped")

    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a") as f:
            f.write(f"total={total}\n")
            f.write(f"passed={passed}\n")
            f.write(f"failed={failed}\n")

    gh_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if gh_summary:
        with open(gh_summary, "a") as f:
            f.write(f"\n## {title}\n\n")
            f.write(f"**{passed}/{total} passed** ({failed} failed, {skipped} skipped)\n\n")
            if cases:
                f.write("| # | Test case | Status |\n|---|---|---|\n")
                for i, c in enumerate(cases, 1):
                    icon = {"passed": "✅", "failed": "❌", "skipped": "⏭️"}[c["status"]]
                    label = c["name"].replace("test_", "").replace("_", " ")
                    f.write(f"| {i} | {label} | {icon} {c['status'].upper()} |\n")
            else:
                f.write("_No test cases were collected — check the run logs above._\n")

    os.makedirs(os.path.dirname(json_out), exist_ok=True)
    with open(json_out, "w") as f:
        json.dump({
            "suite": title,
            "total": total,
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "cases": cases,
        }, f, indent=2)

    print(f"{title}: {passed}/{total} passed, {failed} failed, {skipped} skipped")


if __name__ == "__main__":
    main()
