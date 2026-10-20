"""Verify independent draft fixture expectations; never imports application code."""
import json
from datetime import date
from decimal import Decimal, getcontext
from pathlib import Path

getcontext().prec = 40
D = Decimal
WEIGHTS = dict(zip(
    ["productivity", "criticality", "loading", "completion", "progress", "sales", "facts", "ideas", "suggestions", "freshness"],
    map(D, ["1.5", "0.5", "40", "1.5", ".0125", "1", "1", "1", "1", "1"])))
PRIORITIES = dict(zip(["No", "Low", "Medium", "High", "Focus"], map(D, [".25", ".5", ".75", "1", "1.2"])))
FRESHNESS = dict(zip(["Super Fresh", "Fresh", "Almost Fresh", "Almost Stale", "Stale", "Rotten"], map(D, ["3", "2", "1", "-1", "-2", "-3"])))


def median(values):
    values = sorted(map(D, values))
    assert values, "Empty medians belong in blocked cases"
    n = len(values)
    return values[n // 2] if n % 2 else (values[n // 2 - 1] + values[n // 2]) / 2


def score(deltas):
    assert set(deltas) == set(WEIGHTS), "All ten factors required"
    return sum((WEIGHTS[k] * D(v) for k, v in deltas.items()), D(0))


def checklist(node):
    if node == "N/A":
        return None
    if isinstance(node, str):
        return {"Yes": D(100), "No": D(0)}[node]
    children = [checklist(n) for n in node["children"]]
    applicable = [v for v in children if v is not None]
    assert applicable, "Empty/all-N/A sections belong in blocked cases"
    return sum(applicable, D(0)) / len(applicable)


def classify(assigned, due, reference):
    assigned, due, reference = map(date.fromisoformat, [assigned, due, reference])
    assert reference >= assigned, "Future assignments belong in blocked cases"
    if (reference - assigned).days <= 3:
        return "Super Fresh"
    overdue = (reference - due).days
    for upper, label in [(0, "Fresh"), (2, "Almost Fresh"), (4, "Almost Stale"), (7, "Stale")]:
        if overdue <= upper:
            return label
    return "Rotten"


def calculate(case):
    x, kind = case["input"], case["kind"]
    if kind == "scaled_progress":
        return D(x["scale"]) * D(x["progressPercent"]) / 100
    if kind == "task_productivity":
        return D(x["progressPercent"]) / D(x["taskHours"])
    if kind == "employee_productivity":
        return D(x["scaledProgress"]) / D(x["attendanceHours"])
    if kind == "priority_weights":
        return [PRIORITIES[p] for p in x["priorities"]]
    if kind == "criticality":
        return sum((PRIORITIES[p] for p in x["eligiblePriorities"]), D(0))
    if kind == "loading":
        fraction = D(x["memberScale"]) / D(x["teamScale"])
        return {"fraction": fraction, "displayPercent": fraction * 100}
    if kind == "loading_delta":
        delta = D(x["member"]) - D(x["median"])
        return {"delta": delta, "component": WEIGHTS["loading"] * delta}
    if kind == "median":
        return median(x["values"])
    if kind == "score":
        return score(x["deltas"])
    if kind == "single_factor":
        return WEIGHTS[x["factor"]] * D(x["delta"])
    if kind == "contribution":
        valid, unvalid = (D(".75"), D(".38")) if x["type"] == "facts" else (D(2), D(".75"))
        return valid * D(x["validated"]) + unvalid * D(x["unvalidated"])
    if kind == "freshness_sum":
        return sum((FRESHNESS[s] for s in x["eligibleStates"]), D(0))
    if kind == "sales_subtotals":
        return (D("1.5") * D(x["BO"]) + D(x["BN"]) + D(".75") * D(x["BP"])) / 50
    if kind == "sales_counts":
        # D05 (20 October 2026): flag counts over the member's eligible sales entries.
        bn = len(x["entries"])
        bo = sum(1 for e in x["entries"] if e["newProject"] is True)
        bp = sum(1 for e in x["entries"] if e["basementPaymentReceived"] is True)
        return (D("1.5") * bo + bn + D(".75") * bp) / 50
    if kind == "raw_score":
        assert set(x["rawByFactor"]) == set(WEIGHTS)
        assert set(x["units"]) == set(WEIGHTS)
        assert date.fromisoformat(x["window"]["start"]) <= date.fromisoformat(x["asOf"]) <= date.fromisoformat(x["window"]["end"])
        assert len(set(x["cohortIds"])) == len(x["cohortIds"])
        assert all(len(v) == len(x["cohortIds"]) for v in x["rawByFactor"].values())
        medians = {k: median(v) for k, v in x["rawByFactor"].items()}
        scores = [score({k: D(v[i]) - medians[k] for k, v in x["rawByFactor"].items()}) for i in range(len(x["cohortIds"]))]
        return {"medians": medians, "scores": scores}
    if kind == "eligibility":
        # Isolated single-exclusion cases do not approve multi-failure precedence.
        reason = None
        if D(x["scale"]) <= 0:
            reason = "nonpositiveScale"
        elif x["priority"] == "No":
            reason = "noPriority"
        elif x["status"] in ["Not Started", "Discarded"]:
            reason = "notStarted" if x["status"] == "Not Started" else "discarded"
        elif D(x["progressPercent"]) < 15:
            reason = "belowThreshold"
        return {"eligible": reason is None, "reason": reason}
    if kind == "freshness_dates":
        return [classify(x["assigned"], x["due"], x["completion"] or as_of) for as_of in x["asOf"]]
    if kind == "checklist":
        return checklist(x)
    if kind == "section_progress":
        return D(x["activity"])
    if kind == "progress_delta":
        result = min(D(100), max(D(0), D(x["progress"]) + D(x["requestedDelta"])))
        return {"progress": result, "effectiveDelta": result - D(x["progress"])}
    if kind == "even_split":
        half = D(x["sourceScale"]) / 2
        return {"source": half, "support": half}
    if kind == "proportional_support":
        return {"sourceScales": list(map(D, x["sourceScales"])), "supportScales": [D(s) * D(x["percentage"]) / 100 for s in x["sourceScales"]]}
    raise AssertionError(f"Unknown kind: {kind}")


def compare(actual, expected):
    if isinstance(actual, D):
        return actual == D(expected)
    if isinstance(actual, list):
        return isinstance(expected, list) and len(actual) == len(expected) and all(compare(a, e) for a, e in zip(actual, expected))
    if isinstance(actual, dict):
        return isinstance(expected, dict) and actual.keys() == expected.keys() and all(compare(actual[k], expected[k]) for k in actual)
    return actual == expected


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2] / "__tests__" / "fixtures"
    confirmed = json.loads((root / "m00-confirmed.json").read_text(encoding="utf-8"))
    blocked = json.loads((root / "m00-blocked.json").read_text(encoding="utf-8"))
    ids = set()
    for payload in [confirmed, blocked]:
        assert payload["contract_version"] == "m00-contract-draft-2026-10-10"
        for case in payload["cases"]:
            assert case["id"] not in ids and case["rules"]
            ids.add(case["id"])
    for case in confirmed["cases"]:
        actual = calculate(case)
        assert compare(actual, case["expected"]), f"{case['id']}: expected {case['expected']}, got {actual}"
    for case in blocked["cases"]:
        assert case["expected"] is None and case["decisions"] and case["reason"] and case["module"]
    assert {c["input"]["factor"] for c in confirmed["cases"] if c["kind"] == "single_factor"} == set(WEIGHTS)
    print(f"PASS: {len(confirmed['cases'])} independent fixture cases; all ten coefficients covered.")
    print(f"PENDING: {len(blocked['cases'])} decision-dependent cases (validated metadata, not executed/passed).")
    print("Application/SQL conformance: NOT TESTED by this verifier.")
