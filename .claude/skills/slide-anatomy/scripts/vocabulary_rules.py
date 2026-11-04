#!/usr/bin/env python3
"""The Python evaluator of the vocabulary's identification rules (packages/vocabulary/data/vocabulary.json).

The same rules and the same predicate set as packages/vocabulary/src/identify.js + predicates.js (the JS test
__tests__/python.test.js runs both on every fixture and requires the same answers). anatomy.py calls `identify_all`
for its role pass (chain `element`) and its category (chain `kind`); the measurements stay in anatomy.py.

usage (the parity test): python3 vocabulary_rules.py --cases cases.json   -> prints the results as JSON
"""
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def _find_vocabulary():
    d = HERE
    for _ in range(8):
        p = os.path.join(d, "packages", "vocabulary", "data", "vocabulary.json")
        if os.path.exists(p):
            return p
        d = os.path.dirname(d)
    raise FileNotFoundError("packages/vocabulary/data/vocabulary.json not found above " + HERE)


VOCABULARY_FILE = _find_vocabulary()
_V = None


def vocabulary():
    global _V
    if _V is None:
        v = json.load(open(VOCABULARY_FILE, encoding="utf-8"))
        patterns = {k: re.compile(src, re.I) for k, src in v["patterns"].items()}
        chains = {k: dict(c, rules=[]) for k, c in v["chains"].items()}
        for e in v["terms"]:
            for r in e["identify"]:
                chains[r["scope"]]["rules"].append(dict(r, term=e["term"], namespace=e["namespace"]))
        for c in chains.values():
            c["rules"].sort(key=lambda r: r["order"])
        _V = {"raw": v, "patterns": patterns, "chains": chains}
    return _V


def patterns():
    return vocabulary()["patterns"]


# ------------------------------------------------------------------------------------------------ predicates

def get(obj, path):
    cur = obj
    for k in path.split("."):
        if cur is None or not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def truthy(v):
    return not (v is None or v is False or v == 0 or v == "" or (isinstance(v, (list, dict)) and len(v) == 0))


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def value_of(expr, s, ctx):
    if expr is None or isinstance(expr, (bool, str)) or is_num(expr):
        return expr
    if isinstance(expr, dict):
        if "ctx" in expr:
            v = ctx.get(expr["ctx"])
            if v is None or v == 0:
                return None
            return v * expr.get("times", 1)
        if "field" in expr:
            v = get(s, expr["field"])
            if v is None:
                return None
            return v * expr.get("times", 1)
    raise ValueError("vocabulary: bad value expression %r" % (expr,))


def _compare(op):
    def fn(arg, s, ctx, p):
        field, expr = arg[0], arg[1]
        missing = arg[2] if len(arg) > 2 else "fail"
        a = get(s, field)
        if not is_num(a):
            return False
        b = value_of(expr, s, ctx)
        if b is None:
            return missing == "pass"
        return {"gte": a >= b, "gt": a > b, "lte": a <= b, "lt": a < b}[op]
    return fn


def reads_before(a, b):
    ov = min(a[3], b[3]) - max(a[1], b[1])
    hmin = min(a[3] - a[1], b[3] - b[1])
    if hmin > 0 and ov >= 0.5 * hmin:
        return a[0] < b[0]
    return a[1] < b[1] or (a[1] == b[1] and a[0] < b[0])


def same_item(a, b):
    return a is not b and a.get("block") is not None and a.get("block") == b.get("block") and \
        a.get("item") is not None and a.get("item") == b.get("item")


def _text(arg, s, ctx, p):
    return isinstance(s.get("text"), str) and bool(ctx["patterns"][arg].search(s["text"].strip()))


def _rank(arg, s, ctx, p):
    among = arg.get("among", {})
    pool = [o for o in p.subjects if p.free(o) and (not among.get("kind") or o.get("kind") in among["kind"])
            and (o.get("words") or 0) >= among.get("minWords", 0) and is_num(get(o, arg["by"]))]
    if not any(o is s for o in pool):
        return False
    top = max(get(o, arg["by"]) for o in pool)
    ties = sorted([o for o in pool if get(o, arg["by"]) >= top - arg.get("tol", 0)], key=lambda o: o["bbox"][1])
    return ties[0] is s


def _stacked(arg, s, ctx, p):
    ref = next((o for o in p.subjects if (p.term_of(o) or {}).get("term") == arg["on"]), None)
    if ref is None or ref is s or not is_num(s.get("sizePctH")) or not s["sizePctH"] < ref["sizePctH"]:
        return False
    tb = list(ref["bbox"])
    if arg.get("grow"):
        for o in p.subjects:
            t = p.term_of(o)
            if o is not s and t and t["term"] in arg["grow"]:
                tb = [tb[0], tb[1], max(tb[2], o["bbox"][2]), max(tb[3], o["bbox"][3])]
    b = s["bbox"]
    near_x = abs(b[0] - tb[0]) < arg["edgeTol"] or (
        ref.get("align") == "centre" and abs((b[0] + b[2]) / 2 - (tb[0] + tb[2]) / 2) < arg["centreTol"])
    if not near_x:
        return False
    gap = b[1] - tb[3] if arg["side"] == "below" else tb[1] - b[3]
    return 0 <= gap < ref["sizePctH"] * arg["gapTimesSize"]


def _next_to(arg, s, ctx, p):
    b = s["bbox"]
    for l in p.subjects:
        t = p.term_of(l)
        if not t or t["rule"] != arg["rule"]:
            continue
        lb = l["bbox"]
        if (abs(b[1] - lb[3]) < arg["below"]["dy"] and abs(b[0] - lb[0]) < arg["below"]["dx"]) or \
                (abs(b[0] - lb[2]) < arg["right"]["dx"] and abs(b[1] - lb[1]) < arg["right"]["dy"]):
            return True
    return False


def _below(arg, s, ctx, p):
    b = s["bbox"]
    w = b[2] - b[0]
    for o in p.subjects:
        if o is s or o.get("kind") not in arg["kind"] or (o.get("areaPct") or 0) < arg["minArea"]:
            continue
        g = b[1] - o["bbox"][3]
        ov = min(b[2], o["bbox"][2]) - max(b[0], o["bbox"][0])
        if -0.2 <= g <= arg["gap"] and w > 0 and ov >= arg["overlap"] * w:
            return True
    return False


def _below_text(arg, s, ctx, p):
    pat = ctx["patterns"][arg["pattern"]]
    for o in p.subjects:
        if o is s or o.get("kind") != "text" or not isinstance(o.get("text"), str) or not pat.search(o["text"].strip()):
            continue
        if arg.get("smaller") and not (is_num(s.get("sizePctH")) and is_num(o.get("sizePctH")) and s["sizePctH"] < o["sizePctH"]):
            continue
        g = s["bbox"][1] - o["bbox"][3]
        if -0.2 <= g <= arg["gap"] and min(s["bbox"][2], o["bbox"][2]) - max(s["bbox"][0], o["bbox"][0]) > 0:
            return True
    return False


def _leads(arg, s, ctx, p):
    mates = [o for o in p.subjects if same_item(s, o) and o.get("kind") == "text" and p.free(o)]
    if not mates:
        return False
    w = lambda o: o.get("weight") if o.get("weight") is not None else 400  # noqa: E731
    return all(w(s) > w(o) or (w(s) == w(o) and reads_before(s["bbox"], o["bbox"])) for o in mates)


PREDICATES = {
    "kind": lambda arg, s, ctx, p: s.get("kind") in arg,
    "has": lambda arg, s, ctx, p: truthy(get(s, arg)),
    "lacks": lambda arg, s, ctx, p: not truthy(get(s, arg)),
    "eq": lambda arg, s, ctx, p: get(s, arg[0]) == arg[1] and type(get(s, arg[0])) is type(arg[1]) or
    (is_num(get(s, arg[0])) and is_num(arg[1]) and get(s, arg[0]) == arg[1]),
    "in": lambda arg, s, ctx, p: get(s, arg[0]) in arg[1],
    "gte": _compare("gte"),
    "gt": _compare("gt"),
    "lte": _compare("lte"),
    "lt": _compare("lt"),
    "near": lambda arg, s, ctx, p: is_num(get(s, arg[0])) and is_num(value_of(arg[1], s, ctx)) and
    abs(get(s, arg[0]) - value_of(arg[1], s, ctx)) < arg[2],
    "text": _text,
    "notText": lambda arg, s, ctx, p: not _text(arg, s, ctx, p),
    "match": lambda arg, s, ctx, p: isinstance(get(s, arg[0]), str) and
    bool(ctx["patterns"][arg[1]].search(get(s, arg[0]).strip())),
    "any": lambda arg, s, ctx, p: any(all(test(q, s, ctx, p) for q in group) for group in arg),
    "not": lambda arg, s, ctx, p: not test(arg, s, ctx, p),
    "rank": _rank,
    "stacked": _stacked,
    "nextTo": _next_to,
    "below": _below,
    "belowText": _below_text,
    "sibling": lambda arg, s, ctx, p: any(same_item(s, o) and (p.term_of(o) or {}).get("term") == arg for o in p.subjects),
    "siblingBefore": lambda arg, s, ctx, p: any(same_item(s, o) and (p.term_of(o) or {}).get("term") == arg and
                                                reads_before(o["bbox"], s["bbox"]) for o in p.subjects),
    "leads": _leads,
}


def test(pred, s, ctx, p):
    if len(pred) != 1:
        raise ValueError("vocabulary: a predicate has exactly one key, got %r" % (pred,))
    (name, arg), = pred.items()
    if name not in PREDICATES:
        raise ValueError("vocabulary: unknown predicate %r" % name)
    return PREDICATES[name](arg, s, ctx, p)


# ------------------------------------------------------------------------------------------------ prepare

WORD = re.compile(r"\w+")


def words(t):
    return len(WORD.findall(t or ""))


def _inside(a, b, pad=0.5):
    return a[0] >= b[0] - pad and a[1] >= b[1] - pad and a[2] <= b[2] + pad and a[3] <= b[3] + pad


def _setdefault(s, k, v):
    if s.get(k) is None:
        s[k] = v


def prepare(subjects, ctx):
    aspect = ctx.get("aspect") or 16 / 9
    for s in subjects:
        if isinstance(s.get("text"), str):
            tx = s["text"].strip()
            _setdefault(s, "words", words(tx))
            _setdefault(s, "commas", tx.count(","))
            _setdefault(s, "hasDigit", bool(re.search(r"\d", tx)))
            if s.get("capitalShare") is None:
                ws = re.findall(r"\b\w+", tx)
                s["capitalShare"] = (sum(1 for w in ws if w[0] != w[0].lower()) / s["words"]) if s["words"] else 0
        b = s.get("bbox")
        if isinstance(b, list):
            x0, y0, x1, y1 = b
            for k, v in (("x0", x0), ("y0", y0), ("x1", x1), ("y1", y1), ("w", x1 - x0), ("h", y1 - y0)):
                _setdefault(s, k, v)
            _setdefault(s, "areaPct", round(max(0, s["w"]) * max(0, s["h"]) / 100 * 100) / 100)
            _setdefault(s, "aspect", s["w"] / max(s["h"], 0.01) * aspect)
            _setdefault(s, "inCorner", (y0 < 22 or y1 > 78) and (x0 < 30 or x1 > 70))
            _setdefault(s, "thin", s["h"] < 0.8 or s["w"] < 0.5)
            _setdefault(s, "length", max(s["w"], s["h"]))
            _setdefault(s, "spansSide", (s["w"] > 95 and s["h"] <= 30) or (s["h"] > 95 and s["w"] <= 40))
        if isinstance(s.get("bleed"), list):
            _setdefault(s, "bleedCount", len(s["bleed"]))
        if s.get("block") is not None:
            _setdefault(s, "inBlock", True)
    texts = [o for o in subjects if o.get("kind") == "text" and not o.get("hidden") and isinstance(o.get("bbox"), list)]
    for s in subjects:
        if not isinstance(s.get("bbox"), list) or s.get("kind") == "text":
            continue
        held = [t for t in texts if t is not s and _inside(t["bbox"], s["bbox"])]
        _setdefault(s, "holdsText", len(held) > 0)
        _setdefault(s, "heldTexts", len([t for t in held if not t.get("furniture")]))
        _setdefault(s, "heldWords", sum(t.get("words") if t.get("words") is not None else words(t.get("text")) for t in held))
        _setdefault(s, "heldText", " ".join((t.get("text") or "").strip() for t in held))
        if s.get("thin") and s.get("sidesWithContent") is None:
            s["sidesWithContent"] = sides_with_content(s, subjects)
    for s in subjects:
        if not s.get("inBlock"):
            continue
        mates = [o for o in subjects if o.get("block") == s.get("block")]
        _setdefault(s, "itemFields", 1 if s.get("item") is None else len([o for o in mates if o.get("item") == s.get("item")]))
        _setdefault(s, "blockItems", len({o.get("item") for o in mates if o.get("item") is not None}))
    return subjects


def sides_with_content(s, subjects):
    x0, y0, x1, y1 = s["bbox"]
    horizontal = x1 - x0 >= y1 - y0
    length = x1 - x0 if horizontal else y1 - y0
    content = [o for o in subjects if o is not s and isinstance(o.get("bbox"), list) and o.get("kind") in ("text", "image")
               and not o.get("hidden") and (o.get("areaPct") or 0) < 90]

    def span(b):
        return (b[0], b[2]) if horizontal else (b[1], b[3])

    def overlap_len(b):
        a0, a1 = span(b)
        return min(a1, x1 if horizontal else y1) - max(a0, x0 if horizontal else y0)

    def side(before):
        out = []
        for o in content:
            b = o["bbox"]
            if horizontal:
                gap = y0 - b[3] if before else b[1] - y1
            else:
                gap = x0 - b[2] if before else b[0] - x1
            if -0.2 <= gap <= 15 and overlap_len(b) >= 0.5 * min(length, span(b)[1] - span(b)[0]):
                out.append(o)
        return out

    a, z = side(True), side(False)
    if not a or not z:
        return 1 if (a or z) else 0

    def ext(lst):
        if horizontal:
            return max(o["bbox"][2] for o in lst) - min(o["bbox"][0] for o in lst)
        return max(o["bbox"][3] for o in lst) - min(o["bbox"][1] for o in lst)
    return 2 if length >= 0.5 * max(ext(a), ext(z)) else 1


# ------------------------------------------------------------------------------------------------ evaluator

class _Pass(object):
    def __init__(self, subjects):
        self.subjects = subjects
        self.assigned = {}
        self.start_free = set()

    def term_of(self, o):
        return self.assigned.get(id(o))

    def free(self, o):
        return id(o) in self.start_free


def identify_all(subjects, context=None, scope="element", skip=()):
    """One result per subject: {namespace, term, rule, why[, label]}, {term: unknown}, {none: True} or {hidden: True}."""
    V = vocabulary()
    chain = V["chains"][scope]
    context = dict(context or {})
    visible = [s for s in subjects if not s.get("hidden")]
    prepare(visible, context)
    ctx = dict(context, patterns=V["patterns"])
    p = _Pass(visible)
    results = {}
    none = chain.get("none")
    if none:
        for s in visible:
            if all(test(q, s, ctx, p) for q in none["when"]):
                results[id(s)] = {"none": True, "why": none["why"]}
    for rule in chain["rules"]:
        if rule["id"] in skip:
            continue
        p.start_free = {id(o) for o in visible if id(o) not in p.assigned and id(o) not in results}
        order = sorted(visible, key=lambda o: o["bbox"][1]) if rule.get("each") == "top" else visible
        for s in order:
            if id(s) in p.assigned or id(s) in results:
                continue
            if all(test(q, s, ctx, p) for q in rule["when"]):
                hit = {"namespace": rule["namespace"], "term": rule["term"], "rule": rule["id"], "why": rule["why"]}
                if rule.get("label"):
                    hit["label"] = rule["label"]
                p.assigned[id(s)] = hit
    out = []
    for s in subjects:
        if s.get("hidden"):
            out.append({"hidden": True})
        else:
            out.append(results.get(id(s)) or p.assigned.get(id(s)) or
                       {"namespace": None, "term": "unknown", "rule": None, "why": "no rule of the %s chain holds" % scope})
    return out


def main(argv):
    opts = dict(zip(argv[0::2], argv[1::2]))
    cases = json.load(open(opts["--cases"], encoding="utf-8"))
    out = []
    for c in cases:
        subjects = [c["subject"]] + c.get("others", [])
        res = identify_all(subjects, c.get("context"), c.get("scope", "element"), c.get("skip", []))
        out.append(res[0])
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main(sys.argv[1:])
