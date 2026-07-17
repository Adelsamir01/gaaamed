import base64, json, os, sys, glob

def make_chunks(filepath, outdir, tag):
    with open(filepath, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    if os.path.isdir(outdir):
        for old in glob.glob(os.path.join(outdir, "chunk-*.json")):
            os.remove(old)
    else:
        os.makedirs(outdir)
    CH = 60000
    n = (len(b64) + CH - 1) // CH
    for i in range(n):
        part = b64[i*CH:(i+1)*CH]
        body = {"action": "evaluate",
                "args": {"code": "window.__b64_" + tag + "=(window.__b64_" + tag + "||'')+'" + part + "';'acc '+" + "window.__b64_" + tag + ".length"},
                "session": "dedos-play-publish"}
        with open(os.path.join(outdir, "chunk-%04d.json" % i), "w", encoding="ascii") as f:
            f.write(json.dumps(body))
    print("chunks:", n, "total_b64:", len(b64))

if __name__ == "__main__":
    make_chunks(sys.argv[1], sys.argv[2], sys.argv[3])
