#!/usr/bin/env python3
"""Run the anatomy pass over many PDF decks: every page -> raw.json, pixels.json, record.json.

usage: python3 batch.py <decks.json> <out_root> [--root <folder the deck paths are relative to>] [--workers 6] [--only slug,slug]
decks.json: [{"file": "...pdf", "slug": "Firm-0", "firm": "Firm"}, ...]
Writes <out_root>/pages/<slug>/p<NNN>/ and <out_root>/decks/<slug>.json (furniture + page categories).
Already finished pages are skipped (delete a page folder to redo it).
"""
import json
import os
import sys
import traceback
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anatomy  # noqa: E402
import extract_image  # noqa: E402
import extract_pdf  # noqa: E402


def run_deck(deck, out_root, root):
    import io
    import contextlib
    import pymupdf
    f = os.path.join(root, deck["file"]) if root else deck["file"]
    n = pymupdf.open(f).page_count
    base = os.path.join(out_root, "pages", deck["slug"])
    raws = {}
    quiet = io.StringIO()
    for p in range(1, n + 1):
        d = os.path.join(base, "p%03d" % p)
        try:
            with contextlib.redirect_stdout(quiet):
                if not os.path.exists(os.path.join(d, "raw.json")):
                    extract_pdf.main(f, p, d)
                if not os.path.exists(os.path.join(d, "pixels.json")):
                    extract_image.main([os.path.join(d, "render.jpg"), d, "--raw", "x"])
            raws[p] = json.load(open(os.path.join(d, "raw.json")))
        except Exception:
            open(os.path.join(base, "errors.log"), "a").write("p%d\n%s\n" % (p, traceback.format_exc()))
    # furniture: the same object at the same spot on >=40% of the pages (decks of 4+ pages)
    sig = Counter()
    for raw in raws.values():
        for s in {anatomy.signature(o) for o in raw["objects"] if anatomy.area(o["bbox"]) < 900}:
            sig[s] += 1
    furniture = [s for s, c in sig.items() if n >= 4 and c >= max(3, 0.4 * n)]
    deckinfo = {"slug": deck["slug"], "firm": deck.get("firm"), "file": deck["file"], "pages": n, "furniture": furniture, "categories": {}}
    for p, raw in raws.items():
        d = os.path.join(base, "p%03d" % p)
        pixels = json.load(open(os.path.join(d, "pixels.json")))
        try:
            rec = anatomy.analyse(raw, pixels, deckinfo, p, n)
            rec["deck"] = {"slug": deck["slug"], "firm": deck.get("firm"), "file": deck["file"]}
            json.dump(rec, open(os.path.join(d, "record.json"), "w"), indent=1)
            deckinfo["categories"][p] = rec["category"]["name"]
        except Exception:
            open(os.path.join(base, "errors.log"), "a").write("anatomy p%d\n%s\n" % (p, traceback.format_exc()))
    os.makedirs(os.path.join(out_root, "decks"), exist_ok=True)
    json.dump(deckinfo, open(os.path.join(out_root, "decks", deck["slug"] + ".json"), "w"), indent=1)
    return deck["slug"], n, Counter(deckinfo["categories"].values())


def main(argv):
    decks = json.load(open(argv[0]))
    out_root = argv[1]
    opts = dict(zip(argv[2::2], argv[3::2]))
    if "--only" in opts:
        keep = set(opts["--only"].split(","))
        decks = [d for d in decks if d["slug"] in keep]
    total = Counter()
    with ProcessPoolExecutor(int(opts.get("--workers", 6))) as ex:
        futs = [ex.submit(run_deck, d, out_root, opts.get("--root")) for d in decks]
        for fu in as_completed(futs):
            try:
                slug, n, cats = fu.result()
                total.update(cats)
                print("%-28s %3d pages  %s" % (slug, n, dict(cats)), flush=True)
            except Exception as e:
                print("deck failed:", e, flush=True)
    print("TOTAL", sum(total.values()), dict(total.most_common()))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1:])
