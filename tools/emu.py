#!/usr/bin/env python3
"""مساعد قيادة المحاكي: لمس نص، لقطة شاشة، سرد العناصر."""
import re
import subprocess
import sys
import time

ADB = r"C:\Users\Adel\AppData\Local\Android\Sdk\platform-tools\adb.exe"
DUMP_PATH = "/data/local/tmp/ui.xml"


def run(args, capture=True):
    return subprocess.run([ADB, *args], capture_output=capture, timeout=60)


def dump(dev):
    run(["-s", dev, "shell", "uiautomator", "dump", DUMP_PATH])
    out = run(["-s", dev, "exec-out", "cat", DUMP_PATH])
    return out.stdout.decode("utf-8", "replace")


def elements(data):
    items = []
    for m in re.finditer(
        r'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', data
    ):
        t, x1, y1, x2, y2 = m.groups()
        if t.strip():
            cx = (int(x1) + int(x2)) // 2
            cy = (int(y1) + int(y2)) // 2
            items.append((t, cx, cy, int(x2) - int(x1)))
    return items


def cmd_list(dev, needle=""):
    data = dump(dev)
    for t, cx, cy, w in elements(data):
        if not needle or needle in t:
            print(f"{cx},{cy}  {t[:60]}")


def cmd_tap(dev, needle, occurrence=1, exact=False):
    data = dump(dev)
    matches = [
        (t, cx, cy)
        for t, cx, cy, _ in elements(data)
        if (t == needle if exact else needle in t) and cx > 0 and cy > 0
    ]
    if not matches:
        print(f"NOT_FOUND: {needle}")
        sys.exit(2)
    t, cx, cy = matches[min(occurrence - 1, len(matches) - 1)]
    run(["-s", dev, "shell", "input", "tap", str(cx), str(cy)])
    print(f"TAPPED {cx},{cy}  ({t[:40]})")


def cmd_shot(dev, name):
    out = run(["-s", dev, "exec-out", "screencap", "-p"])
    with open(f"test-shots/{name}.png", "wb") as f:
        f.write(out.stdout)
    print(f"SHOT test-shots/{name}.png ({len(out.stdout)} bytes)")


def cmd_type(dev, text):
    run(["-s", dev, "shell", "input", "text", text])
    print(f"TYPED {text}")


if __name__ == "__main__":
    dev, cmd = sys.argv[1], sys.argv[2]
    rest = sys.argv[3:]
    if cmd == "list":
        cmd_list(dev, rest[0] if rest else "")
    elif cmd == "tap":
        exact = "--exact" in rest
        rest = [a for a in rest if a != "--exact"]
        occ = int(rest[1]) if len(rest) > 1 else 1
        cmd_tap(dev, rest[0], occ, exact)
    elif cmd == "shot":
        cmd_shot(dev, rest[0])
    elif cmd == "type":
        cmd_type(dev, rest[0])
    elif cmd == "wait":
        time.sleep(float(rest[0]))
