#!/usr/bin/env python3
"""PDF page -> raw object list (exact). Every object in % of slide W/H, with draw order (z).

usage: python3 extract_pdf.py <file.pdf> <page 1-based> <out_dir>
writes <out_dir>/raw.json and <out_dir>/render.jpg (1600 px wide, ANATOMY_RENDER_W to change). Needs PyMuPDF (`pip install pymupdf`).
"""
import json
import math
import os
import re
import sys

try:
    import pymupdf
except ImportError:
    sys.exit("PyMuPDF missing: pip install pymupdf (or --target <dir> and set PYTHONPATH)")


def hexc(c):
    if c is None:
        return None
    if isinstance(c, int):
        return "#%06x" % c
    return "#" + "".join("%02x" % round(v * 255) for v in c[:3])


def main(f, pno, out):
    os.makedirs(out, exist_ok=True)
    doc = pymupdf.open(f)
    page = doc[pno - 1]
    W, H = page.rect.width, page.rect.height
    pct = lambda r: [round(r[0] / W * 100, 2), round(r[1] / H * 100, 2), round(r[2] / W * 100, 2), round(r[3] / H * 100, 2)]

    # draw order: the bbox log lists every painted thing in paint order
    log = [(kind, pymupdf.Rect(b)) for kind, b in page.get_bboxlog()]

    def z_of(kind_prefix, rect):
        best, bi = None, -1
        for i, (k, r) in enumerate(log):
            if not k.startswith(kind_prefix):
                continue
            d = abs(r.x0 - rect.x0) + abs(r.y0 - rect.y0) + abs(r.x1 - rect.x1) + abs(r.y1 - rect.y1)
            if best is None or d < best:
                best, bi = d, i
        return bi

    objs = []

    # text: spans -> lines -> blocks (same size, colour and left edge, line gap < 0.8 x size)
    lines = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            dirx = l.get("dir", (1, 0))
            r = pymupdf.Rect(spans[0]["bbox"])
            for s in spans[1:]:
                r |= pymupdf.Rect(s["bbox"])
            main_span = max(spans, key=lambda s: len(s["text"].strip()))
            lines.append({
                "rect": r, "size": round(main_span["size"], 1), "colour": hexc(main_span["color"]),
                "font": main_span["font"], "rotation": round(math.degrees(math.atan2(-dirx[1], dirx[0]))),
                "runs": [{"text": s["text"], "font": s["font"], "pt": round(s["size"], 1), "colour": hexc(s["color"]),
                          "bold": bool(s["flags"] & 16) or bool(re.search(r"bold|black|heavy|super|semibold", s["font"], re.I))}
                         for s in spans],
            })
    lines.sort(key=lambda l: (l["rect"].y0, l["rect"].x0))
    blocks = []
    for l in lines:
        for blk in blocks:
            last = blk[-1]
            if (abs(last["size"] - l["size"]) <= 0.6 and last["colour"] == l["colour"] and last["rotation"] == l["rotation"]
                    and abs(blk[0]["rect"].x0 - l["rect"].x0) <= W * 0.01
                    and 0 <= l["rect"].y0 - last["rect"].y1 <= l["size"] * 0.8):
                blk.append(l)
                break
        else:
            blocks.append([l])
    for blk in blocks:
        r = pymupdf.Rect(blk[0]["rect"])
        for l in blk[1:]:
            r |= l["rect"]
        runs = [run for l in blk for run in l["runs"]]
        pitch = None
        if len(blk) > 1:
            pitch = round(sum(blk[i + 1]["rect"].y0 - blk[i]["rect"].y0 for i in range(len(blk) - 1)) / (len(blk) - 1) / H * 100, 2)
        x1s = [l["rect"].x1 for l in blk]
        cx = [(l["rect"].x0 + l["rect"].x1) / 2 for l in blk]
        align = "left"
        if len(blk) > 1 and max(x1s) - min(x1s) < W * 0.01 and max(l["rect"].x0 for l in blk) - min(l["rect"].x0 for l in blk) > W * 0.01:
            align = "right"
        elif len(blk) > 1 and max(cx) - min(cx) < W * 0.01 and max(l["rect"].x0 for l in blk) - min(l["rect"].x0 for l in blk) > W * 0.01:
            align = "centre"
        fonts = sorted({run["font"] for run in runs})
        objs.append({
            "kind": "text", "bbox": pct(r), "z": z_of("fill-text", r) if True else -1,
            "text": " ".join(l_run["text"].strip() for l_run in runs).strip(),
            "pt": blk[0]["size"], "sizePctH": round(blk[0]["size"] / H * 100, 2), "font": blk[0]["font"], "colour": blk[0]["colour"],
            "fonts": fonts, "lines": len(blk), "linePitchPctH": pitch,
            "leading": round(pitch * H / 100 / blk[0]["size"], 2) if pitch else None,
            "align": align, "rotation": blk[0]["rotation"],
            "emphasisRuns": [run["text"].strip() for run in runs if len(fonts) > 1 and run["font"] != blk[0]["font"]],
            "caps": bool(re.fullmatch(r"[^a-z]*[A-Z][^a-z]*", " ".join(run["text"] for run in runs))),
        })

    # images: placement, pixel size, transparency (cut-out), bleed
    for im in page.get_image_info(xrefs=True):
        r = pymupdf.Rect(im["bbox"])
        if r.is_empty:
            continue
        alpha = False
        if im.get("xref"):
            try:
                alpha = bool(doc.extract_image(im["xref"]).get("smask"))
            except Exception:
                pass
        objs.append({"kind": "image", "bbox": pct(r), "z": z_of("fill-image", r), "px": [im["width"], im["height"]],
                     "transparent": alpha or bool(im.get("has-mask"))})

    # vector shapes: fills, strokes, non-axis angles; small pieces merged into vector groups (logos, icons)
    shapes = []
    for dr in page.get_drawings():
        r = dr["rect"]
        if r.width * r.height < 2 and not (r.width > W * 0.05 or r.height > H * 0.05):
            continue
        angles, segs = {}, {"l": 0, "c": 0, "re": 0, "qu": 0}
        for it in dr["items"]:
            segs[it[0]] = segs.get(it[0], 0) + 1
            if it[0] == "l":
                p1, p2 = it[1], it[2]
                ln = math.hypot(p2.x - p1.x, p2.y - p1.y)
                if ln < min(W, H) * 0.05:
                    continue
                a = math.degrees(math.atan2(p2.y - p1.y, p2.x - p1.x)) % 180
                if min(a, abs(a - 90), 180 - a) > 1:
                    angles[round(a * 2) / 2] = angles.get(round(a * 2) / 2, 0) + round(ln / W * 100, 1)
        shapes.append({"rect": r, "fill": hexc(dr.get("fill")), "stroke": hexc(dr.get("color")), "w": dr.get("width"),
                       "segs": segs, "angles": angles, "seq": dr.get("seqno", 0), "op": dr.get("fill_opacity")})
    small = [s for s in shapes if s["rect"].width * s["rect"].height < W * H * 0.02 and s["rect"].width < W * 0.3]
    big = [s for s in shapes if s not in small]
    groups = []
    for s in small:
        for g in groups:
            gr = pymupdf.Rect(g["rect"])
            gr.x0 -= W * 0.005; gr.y0 -= H * 0.005; gr.x1 += W * 0.005; gr.y1 += H * 0.005
            if gr.intersects(s["rect"]):
                g["rect"] |= s["rect"]; g["n"] += 1; g["fills"].add(s["fill"])
                break
        else:
            groups.append({"rect": pymupdf.Rect(s["rect"]), "n": 1, "fills": {s["fill"]}})
    for s in big:
        objs.append({"kind": "shape", "bbox": pct(s["rect"]), "z": z_of("fill-path", s["rect"]) if s["fill"] else z_of("stroke-path", s["rect"]),
                     "fill": s["fill"], "stroke": s["stroke"], "strokeW": s["w"], "opacity": s["op"], "segments": s["segs"],
                     "angles": s["angles"],
                     "isRect": s["segs"].get("re", 0) + s["segs"].get("qu", 0) > 0 and not s["angles"] and s["segs"].get("c", 0) == 0})
    for g in groups:
        objs.append({"kind": "vectorgroup", "bbox": pct(g["rect"]), "z": z_of("fill-path", g["rect"]), "pieces": g["n"],
                     "fills": sorted(x for x in g["fills"] if x)})

    for i, o in enumerate(sorted(objs, key=lambda o: o["z"])):
        o["id"] = "o%d" % (i + 1)
        b = o["bbox"]
        o["bleed"] = [e for e, v in (("left", b[0] <= 0.3), ("top", b[1] <= 0.3), ("right", b[2] >= 99.7), ("bottom", b[3] >= 99.7)) if v]
    objs.sort(key=lambda o: o["z"])

    width = int(os.environ.get("ANATOMY_RENDER_W", "1600"))
    png = os.path.join(out, "render.jpg")
    page.get_pixmap(matrix=pymupdf.Matrix(width / W, width / W)).save(png, jpg_quality=82)
    raw = {"source": {"kind": "pdf", "file": os.path.abspath(f), "page": pno, "exact": True,
                      "creator": doc.metadata.get("creator")},
           "slide": {"w": W, "h": H, "unit": "pt", "aspect": round(W / H, 3)}, "render": png, "objects": objs}
    json.dump(raw, open(os.path.join(out, "raw.json"), "w"), indent=1)
    print("raw.json: %d objects (%s)" % (len(objs), ", ".join("%s %d" % (k, sum(o["kind"] == k for o in objs)) for k in ("text", "image", "shape", "vectorgroup"))))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(sys.argv[1], int(sys.argv[2]), sys.argv[3])
