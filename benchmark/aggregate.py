#!/usr/bin/env python3
"""Aggregate muster `behave run --json` verdict files into a comparison table.

Usage: python3 benchmark/aggregate.py <dir-of-json-files>
Each file is one model run; the file stem is the column label.
"""
import json, sys, glob, os

def load(d):
    runs = {}
    for path in sorted(glob.glob(os.path.join(d, "*.json"))):
        label = os.path.splitext(os.path.basename(path))[0]
        try:
            runs[label] = json.load(open(path))
        except Exception as e:
            print(f"skip {path}: {e}", file=sys.stderr)
    return runs

def main():
    d = sys.argv[1] if len(sys.argv) > 1 else "benchmark/results"
    runs = load(d)
    if not runs:
        print(f"no result JSONs in {d}"); return
    # case order from the first run
    first = next(iter(runs.values()))
    case_ids = [c["id"] for c in first]
    real = [c for c in case_ids if not c.startswith("xfail_")]

    def cell(verdicts, cid):
        v = next((c for c in verdicts if c["id"] == cid), None)
        if v is None: return "—"
        n = len(v.get("runs", []))
        mark = "✅" if v["passed"] else "❌"
        return f"{mark} {v['passCount']}/{n}"

    models = list(runs.keys())
    # header
    print("| Case | " + " | ".join(models) + " |")
    print("|------|" + "|".join(["---"] * len(models)) + "|")
    for cid in case_ids:
        tag = " _(control, must fail)_" if cid.startswith("xfail_") else ""
        print(f"| `{cid}`{tag} | " + " | ".join(cell(runs[m], cid) for m in models) + " |")
    # summary: real cases passed
    def score(m):
        verdicts = runs[m]
        passed = sum(1 for cid in real if next((c for c in verdicts if c["id"]==cid), {}).get("passed"))
        return f"{passed}/{len(real)}"
    print(f"| **Conformance (real cases)** | " + " | ".join(f"**{score(m)}**" for m in models) + " |")

if __name__ == "__main__":
    main()
