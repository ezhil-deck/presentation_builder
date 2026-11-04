#!/usr/bin/env python3
"""Run the pixel pass and the anatomy pass over many measured slides (folders holding raw.json + render.png).

usage: python3 records_batch.py <root> [--deck deck.json] [--workers 8] [--only id,id]
Every <root>/<id>/ holding raw.json gets pixels.json (extract_image.py --raw) and record.json (anatomy.analyse).
deck.json = {"furniture": [signature, ...]} (anatomy.signature): the objects repeated across the set, as batch.py
detects them for a deck. A folder whose record.json is newer than its raw.json, its render and deck.json is skipped.
Used by scripts/catalogue-records.mjs and scripts/template-records.mjs (the template records, V1); authoring time
only, never in the build.
"""
import contextlib
import io
import json
import os
import sys
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anatomy  # noqa: E402
import extract_image  # noqa: E402


def run_one(d, deck, deck_time=0):
    raw_f = os.path.join(d, "raw.json")
    rec_f = os.path.join(d, "record.json")
    px_f = os.path.join(d, "pixels.json")
    raw = json.load(open(raw_f))
    render = raw.get("render")
    fresh = os.path.exists(rec_f) and os.path.getmtime(rec_f) >= max(os.path.getmtime(raw_f), deck_time) and (
        not render or (os.path.exists(px_f) and os.path.getmtime(px_f) >= os.path.getmtime(render)))
    if fresh:
        return d, "skipped"
    if render and os.path.exists(render) and (not os.path.exists(px_f) or os.path.getmtime(px_f) < os.path.getmtime(render)):
        with contextlib.redirect_stdout(io.StringIO()):
            extract_image.main([render, d, "--raw", "x"])
    pixels = json.load(open(px_f)) if os.path.exists(px_f) else None
    rec = anatomy.analyse(raw, pixels, deck, None, None)
    json.dump(rec, open(rec_f, "w"), indent=1)
    return d, "done"


def main(argv):
    root = argv[0]
    opts = dict(zip(argv[1::2], argv[2::2]))
    deck = json.load(open(opts["--deck"])) if "--deck" in opts else None
    only = set(opts["--only"].split(",")) if "--only" in opts else None
    dirs = sorted(os.path.join(root, n) for n in os.listdir(root)
                  if os.path.exists(os.path.join(root, n, "raw.json")) and (not only or n in only))
    done = skipped = failed = 0
    with ProcessPoolExecutor(int(opts.get("--workers", 8))) as ex:
        deck_time = os.path.getmtime(opts["--deck"]) if "--deck" in opts else 0
        futs = {ex.submit(run_one, d, deck, deck_time): d for d in dirs}
        for k, fu in enumerate(as_completed(futs), 1):
            try:
                _, how = fu.result()
                done += how == "done"
                skipped += how == "skipped"
            except Exception:
                failed += 1
                sys.stderr.write("%s\n%s\n" % (futs[fu], traceback.format_exc()))
            if k % 200 == 0 or k == len(dirs):
                print("records_batch: %d / %d (%d measured, %d skipped, %d failed)" % (k, len(dirs), done, skipped, failed), flush=True)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
