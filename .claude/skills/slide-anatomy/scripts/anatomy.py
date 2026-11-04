#!/usr/bin/env python3
"""raw.json (+ pixels.json) -> record.json: roles, category, margins, edges, rhythm, type scale, zones, balance, QA.

usage: python3 anatomy.py <dir holding raw.json> [--deck deck.json] [--page N --pages M]
deck.json (written by batch.py) lists the furniture signatures repeated across a deck's pages.
Every value is measured from the objects. Roles and the category are decided by the vocabulary's rules
(packages/vocabulary/data/vocabulary.json, run by vocabulary_rules.py: chain `element` for roles, `kind` for the
category); the rule that decided each is kept in `why` (and `rule`). references/roles.md is generated from the
vocabulary.
"""
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vocabulary_rules as V  # noqa: E402

# the text patterns live in the vocabulary (one source); anatomy reads the ones its measurements need
P = V.patterns()
R_PAGENUM = P["pagenum"]
R_NUMBER = P["number"]
R_AGENDA = P["agenda"]
R_QUOTE = re.compile(r"^[\"“‘']|[\"”’']$")


def area(b):
    return max(0, b[2] - b[0]) * max(0, b[3] - b[1])


def inside(a, b, pad=0.5):
    return a[0] >= b[0] - pad and a[1] >= b[1] - pad and a[2] <= b[2] + pad and a[3] <= b[3] + pad


def overlap(a, b):
    return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))


def words(t):
    return len(re.findall(r"\w+", t or ""))


def lum(hexc):
    if not hexc:
        return None
    c = [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = lum(a), lum(b)
    if la is None or lb is None:
        return None
    return round((max(la, lb) + 0.05) / (min(la, lb) + 0.05), 2)


def signature(o):
    """Furniture signature: kind | text (a page number as #, digit runs as #) | x % | y %. Digit runs count as one sign so a
    running footer that carries the page number ("Kearney 12") is the same object on every page."""
    tx = o.get("text") or ""
    tx = "#" if R_PAGENUM.match(tx or "x") else re.sub(r"\d+", "#", tx)[:24]
    return "%s|%s|%d|%d" % (o["kind"], tx, round(o["bbox"][0]), round(o["bbox"][1]))


def analyse(raw, pixels=None, deck=None, page=None, pages=None):
    objs = [dict(o) for o in raw["objects"]]
    furniture = set((deck or {}).get("furniture", []))
    texts = [o for o in objs if o["kind"] == "text"]
    for o in objs:
        o["areaPct"] = round(area(o["bbox"]) / 100, 2)  # % of slide
        o["role"], o["why"] = None, None
        if signature(o) in furniture:
            o["furniture"] = True
    # painted over by a later opaque image: not visible, kept as a QA finding only
    for o in objs:
        cover = [c for c in objs if c["kind"] == "image" and c.get("transparent") is False and c["z"] > o["z"] and inside(o["bbox"], c["bbox"], 0.2)]
        if cover and o["areaPct"] < 90:
            o["role"], o["why"], o["hidden"] = "hidden", "painted over by %s (an opaque image)" % cover[0]["id"], True
    texts = [o for o in objs if o["kind"] == "text" and not o.get("hidden")]

    # body size = the size carrying the most words (ignoring furniture)
    by = {}
    for t in texts:
        if not t.get("furniture"):
            by[t["sizePctH"]] = by.get(t["sizePctH"], 0) + words(t["text"])
    if len(by) > 1:
        by.pop(max(by))
        body = max(by, key=by.get)
    elif by:
        body = next(iter(by))  # one size only: it is the body size (a lone statement is still the title: title runs first)
    else:
        body = None

    # --- measurements the vocabulary's rules read (relational ones are derived by vocabulary_rules.prepare)
    for o in objs:
        if o["kind"] == "vectorgroup":
            inner = [t for t in texts if inside(t["bbox"], o["bbox"])]
            o["textsInside"] = len(inner)
            o["numberLabelsInside"] = sum(1 for t in inner if re.search(r"\d", t["text"]) and words(t["text"]) <= 3)
    aspect = raw["slide"]["aspect"]
    marks = [o for o in objs if o["kind"] in ("image", "vectorgroup") and 0.1 <= o["areaPct"] < 5 and not o.get("hidden") and
             (o["kind"] == "image" or o.get("pieces", 1) >= 3) and not any(inside(t["bbox"], o["bbox"]) for t in texts) and
             (o["bbox"][2] - o["bbox"][0]) / max(o["bbox"][3] - o["bbox"][1], 0.01) * aspect >= 1.2]
    for o in marks:  # marks of similar height on its row or column, apart from it (abutting tiles of one picture are not peers)
        b, h = o["bbox"], o["bbox"][3] - o["bbox"][1]
        o["peerMarks"] = 1 + sum(1 for m in marks if m is not o and abs((m["bbox"][3] - m["bbox"][1]) - h) <= 0.25 * max(h, 0.01) and
                                 ((abs(m["bbox"][1] - b[1]) < 1.5 and max(m["bbox"][0] - b[2], b[0] - m["bbox"][2]) >= 0.3) or
                                  (abs(m["bbox"][0] - b[0]) < 1.5 and max(m["bbox"][1] - b[3], b[1] - m["bbox"][3]) >= 0.3)))

    # --- roles: the vocabulary's element chain (hidden objects keep their QA role)
    results = V.identify_all(objs, {"aspect": raw["slide"]["aspect"], "bodyPctH": body}, "element")
    for o, r in zip(objs, results):
        if r.get("hidden"):
            continue
        o["role"], o["why"], o["rule"] = r["term"], r["why"], r.get("rule")
    title = next((o for o in objs if o["role"] == "title"), None)

    def of(role):
        return [o for o in objs if o["role"] == role]

    # --- category
    nwords = sum(words(t["text"]) for t in texts if t["role"] not in ("footer-text", "page-number", "legal", "source"))
    alltext = " ".join(t["text"] for t in texts)
    bigs = of("big-number")
    charts = of("chart-exhibit") + of("diagram") + of("illustration")  # the old chart-or-diagram vector groups
    xs0 = {}
    for t in texts:
        if t["role"] in ("body", "label", "unknown") and t["lines"] <= 2:
            xs0[round(t["bbox"][0])] = xs0.get(round(t["bbox"][0]), 0) + 1
    gridcols = sum(1 for v in xs0.values() if v >= 3)
    pics = of("hero-image") + of("cutout") + of("background-art")
    dark_bg = None
    bgs = of("background")
    if bgs and bgs[0].get("fill"):
        dark_bg = lum(bgs[0]["fill"]) < 0.2
    elif pixels:
        dark_bg = lum(pixels["background"]["colour"]) < 0.2
    pics_small = of("picture")
    main_texts = [t for t in texts if t["role"] not in ("footer-text", "page-number", "legal", "source", "hidden")]
    numlabels = [t for t in texts if t["role"] in ("label", "unknown", "body") and re.search(r"\d", t["text"]) and words(t["text"]) <= 3]
    shapes_n = sum(1 for o in objs if o["kind"] in ("shape", "vectorgroup") and o["areaPct"] < 50)
    cells = [t for t in texts if t["role"] in ("body", "label", "unknown") and t["lines"] <= 2 and words(t["text"]) <= 8]
    rows = {}
    for t in cells:
        rows.setdefault(round(t["bbox"][1] / 0.8), []).append(t)
    table_rows = sum(1 for r in rows.values() if len({round(t["bbox"][0]) for t in r}) >= 3 and
                     sorted(words(t["text"]) for t in r)[len(r) // 2] <= 4)  # card grids carry longer lines
    blocks = [t for t in texts if t["role"] in ("body", "heading", "label", "unknown") and words(t["text"]) >= 4]
    colx = {}
    for t in blocks:
        k = next((x for x in colx if abs(x - t["bbox"][0]) <= 1.0), t["bbox"][0])
        colx.setdefault(k, []).append(t)
    colblocks = sum(1 for v in colx.values() if len(v) >= 1 and any(len(t["text"]) > 25 for t in v))
    maxsize = max((t.get("sizePctH") or 0) for t in texts) if texts else 0
    legal_words = sum(words(t["text"]) for t in of("legal"))
    tops = [t for t in of("title") if t["bbox"][1] < 15]
    field_pics = [o for o in pics if o["bleed"] or o.get("transparent") or o["role"] == "background-art" or
                  not any(t["bbox"][3] <= o["bbox"][1] + 1 for t in tops)]
    # the slide's measurements -> the vocabulary's `kind` chain (E3 slide kinds; each rule keeps the anatomy name)
    closing = [t for t in texts if t["role"] in ("title", "heading", "contact") and
               (P["closingHeading"].match(t["text"].strip()) or P["closingTail"].search(t["text"].strip()) and words(t["text"]) <= 8)
               and (t["role"] in ("title", "heading") or (t.get("sizePctH") or 0) >= 0.9 * maxsize)]
    slide = {"kind": "slide", "page": page, "pages": pages, "fromEnd": (pages - page) if (pages and page) else None,
             "words": nwords, "legalWords": legal_words, "charts": len(charts), "numberLabels": len(numlabels),
             "bigNumbers": len(bigs), "shapes": shapes_n, "tableRows": table_rows, "columns": colblocks,
             "wordsPerColumn": (nwords / colblocks) if colblocks else None, "pictures": len(pics_small), "photos": len(pics),
             "mainTexts": len(main_texts), "fieldPictures": len(field_pics), "darkBackground": dark_bg,
             "hasTitle": bool(of("title")), "titleToBody": (title["sizePctH"] / body) if title and body else None,
             "agendaHeading": any(R_AGENDA.match(t["text"].strip()) for t in texts if t["role"] in ("title", "heading", "eyebrow")),
             "closingHeading": bool(closing),
             "closingWords": bool(of("contact") or P["closingWords"].search(alltext)),
             "legalStart": bool(P["legalStart"].search(alltext.strip())), "quoteText": bool(R_QUOTE.search(alltext.strip()))}
    kr = V.identify_all([slide], {}, "kind")[0]
    cat, why = (kr.get("label") or {}).get("anatomy") or kr["term"], kr["why"]
    if cat == "text-heavy" and kr.get("rule") == "text.columns":
        why = "%d columns of long running text (%d words per column)" % (colblocks, nwords // colblocks)
    elif kr.get("rule") == "table.rows":
        why = "%d rows of >=3 short cells sharing a baseline" % table_rows
    elif kr.get("rule") == "cards.columns":
        why = "%d columns of text blocks side by side" % colblocks

    # --- geometry
    content = [o for o in objs if o["role"] not in ("background", "background-art") and not o["bleed"]]
    tx_content = [o for o in content if o["kind"] == "text"]
    margins = None
    marked = [o for o in content if o["kind"] == "text" or o.get("furniture") or o["role"] in ("brand-logo", "partner-logo", "logo-item")]
    if marked:
        margins = {"left": round(min(o["bbox"][0] for o in marked), 2), "top": round(min(o["bbox"][1] for o in marked), 2),
                   "right": round(100 - max(o["bbox"][2] for o in marked), 2), "bottom": round(100 - max(o["bbox"][3] for o in marked), 2)}
        # a side no text or mark reaches has no margin to measure (open side, e.g. an image half)
        margins["open"] = [k for k in ("left", "top", "right", "bottom") if margins[k] > 25]
    edges = []
    for o in sorted(content, key=lambda o: o["bbox"][0]):
        x = o["bbox"][0]
        e = next((e for e in edges if abs(e["x"] - x) <= 0.6), None)
        if e:
            e["ids"].append(o["id"]); e["x"] = round((e["x"] * (len(e["ids"]) - 1) + x) / len(e["ids"]), 2)
        else:
            edges.append({"x": round(x, 2), "ids": [o["id"]]})
    edges = sorted([e for e in edges if len(e["ids"]) >= 2], key=lambda e: -len(e["ids"]))
    main_edge = edges[0]["x"] if edges else None
    off_edge = [t["id"] for t in tx_content if t["role"] not in ("label", "page-number", "footer-text", "unknown", "big-number")
                and all(abs(t["bbox"][0] - e["x"]) > 0.6 for e in edges) and t["align"] == "left"]

    # vertical rhythm of the title column
    rhythm = None
    if title:
        tb = title["bbox"]
        col = [o for o in objs if o["role"] not in ("background", "background-art", "hero-image", "cutout", "cut-shape", "band", "panel", "decor", "rule",
                                                    "divider")
               and not o["bleed"] and abs(o["bbox"][0] - tb[0]) < 2.0]
        col.sort(key=lambda o: o["bbox"][1])
        steps = []
        for a, b in zip(col, col[1:]):
            g = round(b["bbox"][1] - a["bbox"][3], 2)
            steps.append({"from": a["id"], "fromRole": a["role"], "to": b["id"], "toRole": b["role"], "gapPctH": g,
                          "gapInTitleSize": round(g / title["sizePctH"], 2)})
        small = sorted(s["gapPctH"] for s in steps if s["gapPctH"] > 0)
        unit = small[0] if small else None
        groups, cur = [], [col[0]["id"]] if col else []
        for s in steps:
            if unit and s["gapPctH"] > max(unit * 1.6, title["sizePctH"] * 0.45):
                groups.append(cur); cur = [s["to"]]
            else:
                cur.append(s["to"])
        if cur:
            groups.append(cur)
        rhythm = {"column": [o["id"] for o in col], "steps": steps, "groups": groups, "innerGap": unit}

    sizes = sorted({round(t["sizePctH"], 1) for t in texts if t["role"] not in ("footer-text", "page-number")}, reverse=True)
    scale = {"sizesPctH": sizes, "count": len(sizes), "ratios": [round(a / b, 2) for a, b in zip(sizes, sizes[1:])],
             "bodyPctH": body, "titlePctH": title["sizePctH"] if title else None,
             "titleToBody": round(title["sizePctH"] / body, 2) if title and body else None,
             "titleWords": words(title["text"]) if title else None, "titleLines": title["lines"] if title else None,
             "titleLeading": title.get("leading") if title else None,
             "faces": sorted({t["font"] for t in texts}), "emphasisRuns": title.get("emphasisRuns") if title else None,
             "titleCaps": title.get("caps") if title else None}

    def union(lst):
        if not lst:
            return None
        return [round(min(o["bbox"][0] for o in lst), 1), round(min(o["bbox"][1] for o in lst), 1),
                round(max(o["bbox"][2] for o in lst), 1), round(max(o["bbox"][3] for o in lst), 1)]
    tz = union([t for t in texts if t["role"] in ("title", "subtitle", "eyebrow", "body", "heading", "date", "authors", "big-number")])
    vz = union([o for o in objs if o["role"] in ("hero-image", "cutout", "chart-exhibit", "diagram", "illustration", "picture", "cut-shape", "panel", "card")])
    zones = {"text": tz, "visual": vz,
             "split": None if not (tz and vz) else ("left-right" if tz[2] <= vz[0] + 3 else "right-left" if vz[2] <= tz[0] + 3 else
                                                   "top-bottom" if tz[3] <= vz[1] + 3 else "bottom-top" if vz[3] <= tz[1] + 3 else "overlap"),
             "textAreaPct": round(area(tz) / 100, 1) if tz else 0, "visualAreaPct": round(area(vz) / 100, 1) if vz else 0}

    logos = []
    for o in of("brand-logo") + of("partner-logo") + of("logo-item"):
        b = o["bbox"]
        logos.append({"id": o["id"], "role": o["role"], "wPctW": round(b[2] - b[0], 2), "hPctH": round(b[3] - b[1], 2),
                      "corner": ("top" if b[1] < 50 else "bottom") + "-" + ("left" if b[0] < 50 else "right"),
                      "hToTitleSize": round((b[3] - b[1]) / title["sizePctH"], 2) if title else None})
    images = [{"id": o["id"], "role": o["role"], "bbox": o["bbox"], "areaPct": o["areaPct"], "bleed": o["bleed"],
               "transparent": o.get("transparent"), "breaksMargin": bool(margins) and o["areaPct"] < 60 and (
                   ("right" not in margins["open"] and "right" not in o["bleed"] and o["bbox"][2] > 100 - margins["right"] + 0.5) or
                   ("bottom" not in margins["open"] and "bottom" not in o["bleed"] and o["bbox"][3] > 100 - margins["bottom"] + 0.5))}
              for o in objs if o["role"] in ("hero-image", "cutout", "picture", "background-art")]
    angles = {}
    for o in objs:
        for a, ln in (o.get("angles") or {}).items():
            a = float(a)
            a = min(a % 180, 180 - a % 180)  # fold to 0-90 from horizontal
            a = round(min(a, 90 - a) if False else a, 1)
            angles[a] = round(angles.get(a, 0) + ln, 1)
    fills = {}
    for o in objs:
        if o.get("fill") and o["kind"] in ("shape", "region"):
            fills[o["fill"]] = round(fills.get(o["fill"], 0) + o["areaPct"], 1)

    # contrast of text against the topmost fill under it
    img = None
    if raw.get("render") and os.path.exists(raw["render"]):
        from PIL import Image
        img = Image.open(raw["render"]).convert("RGB")

    def ground(t):
        if img is not None:
            b = t["bbox"]
            box = (max(0, round(b[0] / 100 * img.width) - 3), max(0, round(b[1] / 100 * img.height) - 3),
                   min(img.width, round(b[2] / 100 * img.width) + 3), min(img.height, round(b[3] / 100 * img.height) + 3))
            if box[2] - box[0] > 2 and box[3] - box[1] > 2:
                crop = img.crop(box).quantize(colors=3)
                pal, hist = crop.getpalette(), crop.histogram()[:3]
                tc = t.get("colour")
                order = [k for k in sorted(range(3), key=lambda k: -hist[k]) if hist[k] and len(pal) >= k * 3 + 3]
                for k in order:  # commonest colour that is not the text colour
                    c = "#%02x%02x%02x" % tuple(pal[k * 3:k * 3 + 3])
                    if not tc or contrast(c, tc) > 1.3:
                        return c
                return "#%02x%02x%02x" % tuple(pal[order[0] * 3:order[0] * 3 + 3]) if order else None
        cx, cy = (t["bbox"][0] + t["bbox"][2]) / 2, (t["bbox"][1] + t["bbox"][3]) / 2
        under = [o for o in objs if o["kind"] in ("shape", "region") and o.get("fill") and o["z"] < t["z"] and
                 o["bbox"][0] <= cx <= o["bbox"][2] and o["bbox"][1] <= cy <= o["bbox"][3]]
        return under[-1]["fill"] if under else None
    lowc = []
    for t in texts:
        g = ground(t)
        c = contrast(t.get("colour"), g)
        t["ground"], t["contrast"] = g, c
        if c is not None and c < (3 if t["sizePctH"] >= 3.3 else 4.5) and t["role"] not in ("footer-text", "page-number"):
            lowc.append({"id": t["id"], "contrast": c})

    qa = {"placeholders": [t["id"] for t in of("placeholder")], "hidden": [o["id"] for o in of("hidden")], "offEdgeText": off_edge, "sizesOver5": len(sizes) > 5,
          "titleOver25Words": bool(title and words(title["text"]) > 25), "lowContrast": lowc,
          "smallestTextPctH": min((t["sizePctH"] for t in texts), default=None),
          "tinyText": [t["id"] for t in texts if t["sizePctH"] < 1.3 and t["role"] not in ("legal",)]}

    rec = {"source": raw["source"], "slide": raw["slide"], "render": raw.get("render"), "page": page, "pages": pages,
           "category": {"name": cat, "term": kr.get("term"), "why": why},
           "L1_elements": [{k: o.get(k) for k in ("id", "role", "why", "rule", "kind", "bbox", "areaPct", "z", "text", "pt", "sizePctH", "font", "weight",
                                                  "colour", "fill", "lines", "leading", "align", "caps", "emphasisRuns", "bleed", "transparent",
                                                  "angles", "ground", "contrast", "furniture", "px", "radius") if o.get(k) not in (None, [], {}, False)}
                           for o in objs],
           "L2_composition": {"background": (bgs[0].get("fill") if bgs else None) or (pixels or {}).get("background", {}).get("colour"),
                              "backgroundArt": bool(of("background-art")), "darkBackground": dark_bg,
                              "margins": margins, "edges": edges, "mainEdge": main_edge, "rhythm": rhythm, "zones": zones,
                              "images": images, "angles": angles, "fills": fills,
                              "layers": [o["id"] + ":" + (o["role"] or "") for o in sorted(objs, key=lambda o: o["z"])]},
           "L3_balance": {"typeScale": scale, "logos": logos,
                          "weight": (pixels or {}).get("weight"), "ink": (pixels or {}).get("ink"),
                          "busy3x3": (pixels or {}).get("busy3x3"), "palette": (pixels or {}).get("palette"),
                          "words": nwords},
           "L4_intent": {"signature": None, "brandSignal": None, "notes": None, "_": "filled by eye, see SKILL.md step 6"},
           "QA": qa}
    return rec


def main(argv):
    d = argv[0]
    opts = dict(zip(argv[1::2], argv[2::2]))
    raw = json.load(open(os.path.join(d, "raw.json")))
    px = os.path.join(d, "pixels.json")
    pixels = json.load(open(px)) if os.path.exists(px) else None
    deck = json.load(open(opts["--deck"])) if "--deck" in opts else None
    rec = analyse(raw, pixels, deck, int(opts.get("--page", 0)) or None, int(opts.get("--pages", 0)) or None)
    json.dump(rec, open(os.path.join(d, "record.json"), "w"), indent=1)
    print("record.json: %s | %s" % (rec["category"]["name"], ", ".join("%s:%s" % (e["id"], e["role"]) for e in rec["L1_elements"])))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
