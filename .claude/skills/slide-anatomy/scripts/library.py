#!/usr/bin/env python3
"""All record.json under <out_root>/pages -> <out_root>/library.html: one self-contained page (opens from disk).

usage: python3 library.py <out_root>
Tabs: one per slide category (measured ranges, by-firm table, reference grid, detail view with the overlay),
plus "Method" showing this skill's own files. Category corrections made in the page are kept in the browser and can be
exported as overrides.json; put that file in <out_root> and rebuild to apply them.
"""
import glob
import html
import json
import os
import statistics
import sys

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORDER = ["cover", "agenda", "section-break", "quote", "kpi", "chart", "table", "modular-columns", "image-text", "team-or-gallery",
         "text", "text-heavy", "closing-contact", "back-cover", "legal"]
NAMES = {"cover": "Cover", "agenda": "Agenda", "section-break": "Section break", "quote": "Quote / statement", "kpi": "KPI",
         "chart": "Chart", "table": "Table", "modular-columns": "Modular columns", "image-text": "Image + text",
         "team-or-gallery": "Team / gallery", "text": "Text", "text-heavy": "Text-heavy", "closing-contact": "Closing / CTA",
         "back-cover": "Back cover", "legal": "Legal"}


def pct(vals, q):
    v = sorted(x for x in vals if x is not None)
    if not v:
        return None
    k = (len(v) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(v) - 1)
    return round(v[lo] + (v[hi] - v[lo]) * (k - lo), 2)


def slim(rec, d, root):
    els = []
    for e in rec["L1_elements"][:80]:
        els.append({k: (e[k][:70] if k == "text" else e[k]) for k in ("id", "role", "kind", "bbox", "text", "sizePctH", "font", "colour", "fill",
                                                                        "why", "ground", "contrast") if k in e})
    c, b = rec["L2_composition"], rec["L3_balance"]
    rh = c.get("rhythm") or {}
    roles = {e["id"]: e.get("role") for e in rec["L1_elements"]}
    title = next((e for e in rec["L1_elements"] if e.get("role") == "title"), None)
    qa = rec["QA"]
    flags = [k for k in ("placeholders", "hidden", "offEdgeText", "lowContrast", "tinyText") if qa.get(k)]
    if qa.get("sizesOver5"):
        flags.append("sizesOver5")
    if qa.get("titleOver25Words"):
        flags.append("titleOver25Words")
    return {
        "id": "%s/p%d" % (rec["deck"]["slug"], rec["page"]), "firm": rec["deck"].get("firm"), "slug": rec["deck"]["slug"],
        "page": rec["page"], "pages": rec["pages"], "cat": rec["category"]["name"], "why": rec["category"]["why"],
        "img": os.path.relpath(os.path.join(d, "render.jpg"), root), "aspect": rec["slide"]["aspect"], "els": els,
        "margins": c.get("margins"), "edge": c.get("mainEdge"), "edges": [[e["x"], len(e["ids"])] for e in c.get("edges", [])[:4]],
        "steps": [[s["fromRole"], s["toRole"], s["gapPctH"], s["gapInTitleSize"]] for s in rh.get("steps", [])],
        "groups": [[roles.get(i) for i in g] for g in rh.get("groups", [])], "unit": rh.get("innerGap"),
        "zones": c.get("zones"), "images": c.get("images"), "angles": c.get("angles"), "bg": c.get("background"), "dark": c.get("darkBackground"),
        "bgArt": c.get("backgroundArt"), "scale": b.get("typeScale"), "logos": b.get("logos"),
        "weight": (b.get("weight") or {}).get("centre"), "lr": (b.get("weight") or {}).get("leftRight"),
        "empty": (b.get("ink") or {}).get("emptySpace"), "words": b.get("words"),
        "palette": [p["colour"] for p in (b.get("palette") or [])[:6]],
        "titleTop": title["bbox"][1] if title else None, "titleBox": title["bbox"] if title else None, "qa": flags,
    }


def summary(items):
    def m(f):
        vals = [f(i) for i in items]
        vals = [v for v in vals if v is not None]
        return {"n": len(vals), "med": pct(vals, 0.5), "p10": pct(vals, 0.1), "p90": pct(vals, 0.9)}

    def share(f):
        vals = [f(i) for i in items]
        return round(100 * sum(1 for v in vals if v) / max(len(vals), 1))

    def freq(f):
        out = {}
        for i in items:
            v = f(i)
            for x in (v if isinstance(v, list) else [v]):
                if x is not None:
                    out[x] = out.get(x, 0) + 1
        return dict(sorted(out.items(), key=lambda kv: -kv[1])[:6])
    S = lambda i: i["scale"] or {}
    return {
        "Title size (% H)": m(lambda i: S(i).get("titlePctH")),
        "Title : body": m(lambda i: S(i).get("titleToBody")),
        "Title words": m(lambda i: S(i).get("titleWords")),
        "Title lines": m(lambda i: S(i).get("titleLines")),
        "Title top (% H)": m(lambda i: i["titleTop"]),
        "Title leading": m(lambda i: S(i).get("titleLeading")),
        "Type sizes per slide": m(lambda i: S(i).get("count")),
        "Main left edge (% W)": m(lambda i: i["edge"]),
        "Margin left (% W)": m(lambda i: (i["margins"] or {}).get("left")),
        "Margin top (% H)": m(lambda i: (i["margins"] or {}).get("top")),
        "Margin bottom (% H)": m(lambda i: (i["margins"] or {}).get("bottom")),
        "Inner gap of the title column (% H)": m(lambda i: i["unit"]),
        "Groups in the title column": m(lambda i: len(i["groups"]) if i["groups"] else None),
        "Logo width (% W)": m(lambda i: max((l["wPctW"] for l in i["logos"] if l["role"] in ("brand-logo", "logo")), default=None)),
        "Text zone area (% slide)": m(lambda i: (i["zones"] or {}).get("textAreaPct")),
        "Visual zone area (% slide)": m(lambda i: (i["zones"] or {}).get("visualAreaPct")),
        "Visual weight centre x (% W)": m(lambda i: (i["weight"] or [None])[0]),
        "Visual weight centre y (% H)": m(lambda i: (i["weight"] or [None, None])[1]),
        "Empty space (%)": m(lambda i: i["empty"]),
        "Words": m(lambda i: i["words"]),
        "% dark background": share(lambda i: i["dark"]),
        "% background art": share(lambda i: i["bgArt"]),
        "% with an image breaking the margin": share(lambda i: any(im.get("breaksMargin") for im in (i["images"] or []))),
        "% with angled cuts": share(lambda i: i["angles"]),
        "Text / visual split": freq(lambda i: (i["zones"] or {}).get("split")),
        "Logo corner": freq(lambda i: [l["corner"] for l in i["logos"] if l["role"] in ("brand-logo", "logo")]),
        "Title face": freq(lambda i: next((e.get("font") for e in i["els"] if e.get("role") == "title"), None)),
    }


def by_firm(items):
    firms = {}
    for i in items:
        firms.setdefault(i["firm"], []).append(i)
    rows = []
    for f, its in sorted(firms.items(), key=lambda kv: -len(kv[1])):
        S = lambda i: i["scale"] or {}
        rows.append({"firm": f, "n": len(its),
                     "titlePctH": pct([S(i).get("titlePctH") for i in its], 0.5),
                     "titleToBody": pct([S(i).get("titleToBody") for i in its], 0.5),
                     "edge": pct([i["edge"] for i in its], 0.5),
                     "titleTop": pct([i["titleTop"] for i in its], 0.5),
                     "dark": round(100 * sum(1 for i in its if i["dark"]) / len(its)),
                     "empty": pct([i["empty"] for i in its], 0.5)})
    return rows


def main(root):
    overrides = {}
    ov = os.path.join(root, "overrides.json")
    if os.path.exists(ov):
        overrides = json.load(open(ov))
    items = []
    for f in sorted(glob.glob(os.path.join(root, "pages", "*", "p*", "record.json"))):
        rec = json.load(open(f))
        it = slim(rec, os.path.dirname(f), root)
        if it["id"] in overrides:
            it["auto"], it["cat"], it["why"] = it["cat"], overrides[it["id"]], "set by hand (overrides.json)"
        items.append(it)
    cats = [c for c in ORDER if any(i["cat"] == c for i in items)] + sorted({i["cat"] for i in items} - set(ORDER))
    data = {"cats": [{"key": c, "name": NAMES.get(c, c), "n": sum(1 for i in items if i["cat"] == c),
                      "summary": summary([i for i in items if i["cat"] == c]), "firms": by_firm([i for i in items if i["cat"] == c])}
                     for c in cats],
            "items": items, "decks": len({i["slug"] for i in items}), "firms": len({i["firm"] for i in items})}
    docs = []
    for rel in ["SKILL.md"] + sorted(os.path.relpath(p, SKILL) for p in glob.glob(os.path.join(SKILL, "references", "*.md"))):
        docs.append({"name": rel, "text": open(os.path.join(SKILL, rel)).read()})
    scripts = sorted(os.path.basename(p) for p in glob.glob(os.path.join(SKILL, "scripts", "*.*")))
    page = open(os.path.join(SKILL, "scripts", "library_template.html")).read()
    page = page.replace("/*DATA*/null", json.dumps(data, separators=(",", ":")).replace("</", "<\\/"))
    page = page.replace("/*DOCS*/null", json.dumps({"docs": docs, "scripts": scripts}).replace("</", "<\\/"))
    out = os.path.join(root, "library.html")
    open(out, "w").write(page)
    print("%s: %d slides, %d categories" % (out, len(items), len(cats)))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
