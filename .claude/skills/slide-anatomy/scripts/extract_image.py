#!/usr/bin/env python3
"""Image (screenshot, render, raster reference) -> pixel facts. Pillow only.

usage: python3 extract_image.py <image> <out_dir> [--crop x0,y0,x1,y1 (% of the image)] [--raw raw.json]
       python3 extract_image.py <image> <out_dir> --probe x,y [x,y ...]      (colour at % points)

writes <out_dir>/pixels.json, <out_dir>/grid.png (5% grid for reading positions by eye) and, when no --raw is given,
<out_dir>/raw.json holding the colour regions as objects (add text / logo objects to it by hand, "exact": false).
With --raw (the raw.json of extract_pdf / extract_html) the pixel facts are only written next to it.
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

AW = 800  # analysis width


def hx(c):
    return "#%02x%02x%02x" % tuple(c[:3])


def dist(a, b):
    return sum(abs(int(a[i]) - int(b[i])) for i in range(3))


def fit(points):
    """least squares u = a*v + b over (v, u); returns a, b, rms"""
    n = len(points)
    if n < 4:
        return None
    sv = sum(p[0] for p in points); su = sum(p[1] for p in points)
    svv = sum(p[0] ** 2 for p in points); svu = sum(p[0] * p[1] for p in points)
    den = n * svv - sv * sv
    if den == 0:
        return None
    a = (n * svu - sv * su) / den
    b = (su - a * sv) / n
    rms = math.sqrt(sum((p[1] - (a * p[0] + b)) ** 2 for p in points) / n)
    return a, b, rms


def main(argv):
    src, out = argv[0], argv[1]
    os.makedirs(out, exist_ok=True)
    opts = {}
    i = 2
    while i < len(argv):
        if argv[i] == "--probe":
            opts["probe"] = argv[i + 1:]
            break
        opts[argv[i][2:]] = argv[i + 1]
        i += 2
    im = Image.open(src).convert("RGB")
    if "crop" in opts:
        x0, y0, x1, y1 = [float(v) for v in opts["crop"].split(",")]
        im = im.crop((round(im.width * x0 / 100), round(im.height * y0 / 100), round(im.width * x1 / 100), round(im.height * y1 / 100)))
    full = im
    if "probe" in opts:
        for p in opts["probe"]:
            x, y = [float(v) for v in p.split(",")]
            print(p, hx(full.getpixel((min(full.width - 1, round(full.width * x / 100)), min(full.height - 1, round(full.height * y / 100))))))
        return
    W, H = AW, round(full.height * AW / full.width)
    im = full.resize((W, H), Image.LANCZOS)
    px = im.load()

    # background = commonest border colour
    border = [px[x, y] for x in range(0, W, 4) for y in (0, 1, H - 2, H - 1)] + [px[x, y] for y in range(0, H, 4) for x in (0, 1, W - 2, W - 1)]
    q = lambda c: tuple(v // 12 * 12 for v in c)
    counts = {}
    for c in border:
        counts[q(c)] = counts.get(q(c), 0) + 1
    bg = max(counts, key=counts.get)
    bg_share_border = round(counts[bg] / len(border) * 100)

    # palette (8 colours) with area share
    pal_img = im.quantize(colors=8, method=Image.MEDIANCUT)
    pal = pal_img.getpalette()[:24]
    hist = pal_img.histogram()[:8]
    palette = sorted(({"colour": hx(pal[k * 3:k * 3 + 3]), "area": round(hist[k] / (W * H) * 100, 1), "k": k} for k in range(8)),
                     key=lambda p: -p["area"])

    # ink: pixels away from the background; balance and empty space
    ink = [[0] * 3 for _ in range(3)]
    tot = mx = my = 0
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            if dist(px[x, y], bg) > 60:
                ink[min(2, y * 3 // H)][min(2, x * 3 // W)] += 1
                tot += 1; mx += x; my += y
    cells = (W // 2) * (H // 2)
    inkgrid = [[round(v / cells * 900, 1) for v in row] for row in ink]  # % of each third covered
    edges = im.convert("L").filter(ImageFilter.FIND_EDGES)
    ep = edges.load()
    busy = [[0.0] * 3 for _ in range(3)]
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            busy[min(2, y * 3 // H)][min(2, x * 3 // W)] += ep[x, y]
    busy = [[round(v / (cells / 9) / 2.55, 1) for v in row] for row in busy]  # 0-100 edge energy
    # visual weight (works with no single background): colour distance from the slide mean + edge energy
    mean = [sum(px[x, y][c] for y in range(0, H, 4) for x in range(0, W, 4)) / ((H // 4 + 1) * (W // 4 + 1)) for c in range(3)]
    wg = [[0.0] * 3 for _ in range(3)]
    wt = wx = wy = 0.0
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            w = dist(px[x, y], mean) / 765 + ep[x, y] / 255
            wg[min(2, y * 3 // H)][min(2, x * 3 // W)] += w
            wt += w; wx += w * x; wy += w * y
    weight = {"grid3x3": [[round(v / max(wt, 1e-9) * 100, 1) for v in row] for row in wg],
              "centre": [round(wx / max(wt, 1e-9) / W * 100, 1), round(wy / max(wt, 1e-9) / H * 100, 1)]}
    weight["leftRight"] = round(sum(r[0] + r[1] / 2 for r in weight["grid3x3"]) / max(sum(r[2] + r[1] / 2 for r in weight["grid3x3"]), 1e-9), 2)
    left = sum(ink[r][0] for r in range(3)) + sum(ink[r][1] for r in range(3)) / 2
    right = sum(ink[r][2] for r in range(3)) + sum(ink[r][1] for r in range(3)) / 2

    # flat colour regions: bbox, bleed, fill ratio, straight non-axis edges (angle)
    qpx = pal_img.load()
    regions = []
    for p in palette:
        if p["area"] < 3 or dist(tuple(int(p["colour"][i:i + 2], 16) for i in (1, 3, 5)), bg) <= 36 and p is palette[0]:
            continue
        k = p["k"]
        rows = {}
        cols = {}
        n = 0
        x0, y0, x1, y1 = W, H, 0, 0
        for y in range(0, H, 2):
            for x in range(0, W, 2):
                if qpx[x, y] == k:
                    n += 1
                    rows.setdefault(y, [x, x]); rows[y][0] = min(rows[y][0], x); rows[y][1] = max(rows[y][1], x)
                    cols.setdefault(x, [y, y]); cols[x][0] = min(cols[x][0], y); cols[x][1] = max(cols[x][1], y)
                    x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
        if not n:
            continue
        fillratio = n / max(1, ((x1 - x0) // 2 + 1) * ((y1 - y0) // 2 + 1))
        edges_out = {}
        for name, data, idx, axis_len, other_len in (("right", rows, 1, H, W), ("left", rows, 0, H, W), ("bottom", cols, 1, W, H), ("top", cols, 0, W, H)):
            pts = [(v, e[idx]) for v, e in data.items()]
            # ignore points lying on the slide border (that side bleeds)
            pts = [pt for pt in pts if 2 < pt[1] < other_len - 3]
            if len(pts) < (axis_len // 2) * 0.25:
                continue
            f = fit(pts)
            # robust: drop points far off the line (a corner where another edge takes over), refit
            for _ in range(3):
                if not f:
                    break
                a, b, rms = f
                keep = [pt for pt in pts if abs(pt[1] - (a * pt[0] + b)) <= max(2 * rms, other_len * 0.005)]
                if len(keep) == len(pts) or len(keep) < (axis_len // 2) * 0.2:
                    break
                pts = keep
                f = fit(pts)
            if not f:
                continue
            a, b, rms = f
            ang = math.degrees(math.atan(a))
            edges_out[name] = {"angleFromAxis": round(ang, 1), "straight": rms < other_len * 0.006,
                               "rmsPct": round(rms / other_len * 100, 2),
                               "span": [round(min(p[0] for p in pts) / axis_len * 100, 1), round(max(p[0] for p in pts) / axis_len * 100, 1)],
                               "at": [round((a * min(p[0] for p in pts) + b) / other_len * 100, 1), round((a * max(p[0] for p in pts) + b) / other_len * 100, 1)]}
        regions.append({"colour": p["colour"], "area": p["area"],
                        "bbox": [round(x0 / W * 100, 1), round(y0 / H * 100, 1), round((x1 + 2) / W * 100, 1), round((y1 + 2) / H * 100, 1)],
                        "fillRatio": round(fillratio, 2), "solid": fillratio > 0.6, "edges": edges_out})

    facts = {"image": os.path.abspath(src), "crop": opts.get("crop"), "px": [full.width, full.height],
             "aspect": round(full.width / full.height, 3),
             "background": {"colour": hx(bg), "borderShare": bg_share_border, "single": bg_share_border >= 60},
             "palette": [{k2: v for k2, v in p.items() if k2 != "k"} for p in palette],
             "ink": {"share": round(tot / cells * 100, 1), "emptySpace": round(100 - tot / cells * 100, 1),
                     "grid3x3": inkgrid, "centre": [round(mx / max(tot, 1) / W * 100, 1), round(my / max(tot, 1) / H * 100, 1)],
                     "leftRight": round(left / max(right, 1), 2)},
             "weight": weight, "busy3x3": busy, "regions": regions}
    json.dump(facts, open(os.path.join(out, "pixels.json"), "w"), indent=1)

    if "raw" in opts:  # a render of an exact source needs no reading grid
        print("pixels.json: bg %s, %d regions, ink %.1f%%, centre %s" % (hx(bg), len(regions), facts["ink"]["share"], facts["ink"]["centre"]))
        return
    # 5% grid for reading positions by eye
    g = full.copy()
    d = ImageDraw.Draw(g)
    for k in range(0, 101, 5):
        c = (255, 0, 0) if k % 25 == 0 else (255, 140, 140)
        x = round((g.width - 1) * k / 100); y = round((g.height - 1) * k / 100)
        d.line([(x, 0), (x, g.height)], fill=c, width=1); d.line([(0, y), (g.width, y)], fill=c, width=1)
        if k % 10 == 0:
            d.text((x + 2, 2), str(k), fill=(255, 0, 0)); d.text((2, y + 2), str(k), fill=(255, 0, 0))
    g.save(os.path.join(out, "grid.png"))

    if "raw" not in opts:
        objs = [{"id": "r%d" % (n + 1), "kind": "region", "bbox": r["bbox"], "fill": r["colour"], "z": n, "exact": False,
                 "solid": r["solid"], "angles": {str(e["angleFromAxis"]): e["span"][1] - e["span"][0] for e in r["edges"].values()
                                               if e["straight"] and abs(e["angleFromAxis"]) > 1},
                 "bleed": [s for s, v in (("left", r["bbox"][0] <= 0.5), ("top", r["bbox"][1] <= 0.5), ("right", r["bbox"][2] >= 99.5), ("bottom", r["bbox"][3] >= 99.5)) if v]}
                for n, r in enumerate(regions)]
        cropped = os.path.join(out, "render.png")
        full.save(cropped)
        json.dump({"source": {"kind": "image", "file": os.path.abspath(src), "crop": opts.get("crop"), "exact": False},
                   "slide": {"w": full.width, "h": full.height, "unit": "px", "aspect": round(full.width / full.height, 3)},
                   "render": cropped, "objects": objs}, open(os.path.join(out, "raw.json"), "w"), indent=1)
    print("pixels.json: bg %s, %d regions, ink %.1f%%, centre %s" % (hx(bg), len(regions), facts["ink"]["share"], facts["ink"]["centre"]))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1:])
