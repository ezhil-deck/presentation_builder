#!/usr/bin/env python3
"""record.json -> overlay.png: boxes by role, the main edge, margins and the title column's gaps. For checking by eye.

usage: python3 overlay.py <dir holding record.json>
"""
import json
import os
import sys

from PIL import Image, ImageDraw

COL = {"title": (230, 40, 40), "subtitle": (240, 120, 40), "eyebrow": (240, 160, 40), "body": (60, 120, 230), "heading": (40, 90, 200),
       "label": (120, 160, 230), "big-number": (200, 0, 160), "date": (0, 150, 130), "authors": (0, 120, 110), "legal": (120, 120, 120),
       "source": (120, 120, 120), "page-number": (150, 150, 150), "footer": (150, 150, 150), "footer-mark": (150, 150, 150),
       "logo": (0, 170, 0), "partner-logo": (100, 200, 0), "partner-label": (100, 200, 0), "hero-image": (150, 0, 220),
       "cutout": (190, 60, 255), "picture": (150, 80, 220), "chart-or-diagram": (0, 160, 220), "panel": (255, 180, 0),
       "card": (255, 200, 60), "band": (255, 150, 0), "cut-shape": (255, 90, 0), "rule": (90, 90, 90), "placeholder": (255, 0, 0),
       "contact": (0, 140, 200),
       # vocabulary terms (references/roles.md); the names above stay for records written before V0
       "footer-text": (150, 150, 150), "brand-logo": (0, 170, 0), "logo-item": (60, 190, 60), "chart-exhibit": (0, 160, 220),
       "diagram": (0, 130, 200), "illustration": (0, 190, 220), "divider": (60, 60, 60), "caption": (90, 140, 200),
       "attribution": (0, 120, 110), "quote-mark": (200, 0, 160), "unknown": (255, 0, 255)}


def main(d):
    rec = json.load(open(os.path.join(d, "record.json")))
    im = Image.open(rec["render"]).convert("RGB")
    W, H = im.size
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(ov)
    P = lambda b: (b[0] / 100 * W, b[1] / 100 * H, b[2] / 100 * W, b[3] / 100 * H)
    for e in rec["L1_elements"]:
        if e.get("role") in ("background", "background-art", None):
            continue
        c = COL.get(e["role"], (90, 90, 90))
        x0, y0, x1, y1 = P(e["bbox"])
        dr.rectangle((x0, y0, x1, y1), outline=c + (255,), width=2)
        lab = "%s %s" % (e["id"], e["role"])
        dr.rectangle((x0, max(0, y0 - 13), x0 + 7 * len(lab), max(0, y0 - 13) + 12), fill=c + (215,))
        dr.text((x0 + 2, max(0, y0 - 13)), lab, fill=(255, 255, 255, 255))
    comp = rec["L2_composition"]
    if comp.get("mainEdge") is not None:
        x = comp["mainEdge"] / 100 * W
        for y in range(0, H, 10):
            dr.line((x, y, x, y + 5), fill=(255, 0, 120, 255), width=1)
    m = comp.get("margins")
    if m:
        for k, v in m.items():
            if k == "open" or k in m.get("open", []):
                continue
            if k in ("left", "right"):
                x = (v if k == "left" else 100 - v) / 100 * W
                dr.line((x, 0, x, H), fill=(0, 200, 255, 110), width=1)
            else:
                y = (v if k == "top" else 100 - v) / 100 * H
                dr.line((0, y, W, y), fill=(0, 200, 255, 110), width=1)
    rh = comp.get("rhythm")
    if rh:
        ids = {e["id"]: e for e in rec["L1_elements"]}
        for s in rh["steps"]:
            a, b = ids[s["from"]]["bbox"], ids[s["to"]]["bbox"]
            if s["gapPctH"] <= 0:
                continue
            x = min(a[0], b[0]) / 100 * W - 6
            y0, y1 = a[3] / 100 * H, b[1] / 100 * H
            dr.line((x, y0, x, y1), fill=(255, 0, 120, 255), width=2)
            dr.text((max(0, x - 40), (y0 + y1) / 2 - 6), "%.1f" % s["gapPctH"], fill=(255, 0, 120, 255))
    out = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
    out.save(os.path.join(d, "overlay.jpg"), quality=85)
    print(os.path.join(d, "overlay.jpg"))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
