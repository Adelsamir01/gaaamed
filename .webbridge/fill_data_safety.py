#!/usr/bin/env python3
"""Fill Play Console data-safety CSV per docs/play-store/data-safety.md."""
import csv, sys

SRC = r"C:\Users\Adel\Documents\Kimi\Workspaces\gaaamed\.webbridge\data_safety_export.csv"
DST = r"C:\Users\Adel\Documents\Kimi\Workspaces\gaaamed\.webbridge\data_safety_import.csv"

# Types we collect (7) -> (user_control, [collection purposes])
TYPES = {
    "PSL_NAME":                    ("PSL_DATA_USAGE_USER_CONTROL_OPTIONAL",  ["PSL_APP_FUNCTIONALITY"]),
    "PSL_USER_ACCOUNT":            ("PSL_DATA_USAGE_USER_CONTROL_REQUIRED",  ["PSL_APP_FUNCTIONALITY", "PSL_ACCOUNT_MANAGEMENT"]),
    "PSL_OTHER_PERSONAL":          ("PSL_DATA_USAGE_USER_CONTROL_OPTIONAL",  ["PSL_APP_FUNCTIONALITY", "PSL_PERSONALIZATION"]),
    "PSL_OTHER_MESSAGES":          ("PSL_DATA_USAGE_USER_CONTROL_OPTIONAL",  ["PSL_APP_FUNCTIONALITY"]),
    "PSL_USER_GENERATED_CONTENT":  ("PSL_DATA_USAGE_USER_CONTROL_OPTIONAL",  ["PSL_APP_FUNCTIONALITY"]),
    "PSL_OTHER_APP_ACTIVITY":      ("PSL_DATA_USAGE_USER_CONTROL_REQUIRED",  ["PSL_APP_FUNCTIONALITY"]),
    "PSL_DEVICE_ID":               ("PSL_DATA_USAGE_USER_CONTROL_REQUIRED",  ["PSL_APP_FUNCTIONALITY", "PSL_ACCOUNT_MANAGEMENT"]),
}

rows = list(csv.reader(open(SRC, newline="", encoding="utf-8")))
header, out = rows[0], [rows[0]]
n_set = 0

for r in rows[1:]:
    if not r:
        continue
    q, resp, val = r[0], (r[1] if len(r) > 1 else ""), (r[2] if len(r) > 2 else "")
    new_val = val

    # Step 3: data type selection
    if q.startswith("PSL_DATA_TYPES_"):
        if resp in TYPES:
            new_val = "true"
        else:
            new_val = ""  # ensure everything else stays unselected

    # Step 4: usage details for our 7 types
    elif q.startswith("PSL_DATA_USAGE_RESPONSES:"):
        parts = q.split(":")
        ttype, field = parts[1], parts[2]
        if ttype in TYPES:
            ctl, purposes = TYPES[ttype]
            if field == "PSL_DATA_USAGE_COLLECTION_AND_SHARING":
                new_val = "true" if resp == "PSL_DATA_USAGE_ONLY_COLLECTED" else ""
            elif field == "PSL_DATA_USAGE_EPHEMERAL":
                new_val = "false"
            elif field == "DATA_USAGE_USER_CONTROL":
                new_val = "true" if resp == ctl else ""
            elif field == "DATA_USAGE_COLLECTION_PURPOSE":
                new_val = "true" if resp in purposes else ""
            elif field == "DATA_USAGE_SHARING_PURPOSE":
                new_val = ""  # not shared
        else:
            new_val = ""  # types we don't collect: clear any usage answers

    # keep row width
    while len(r) < 3:
        r.append("")
    if new_val != val:
        n_set += 1
    r[2] = new_val
    out.append(r)

with open(DST, "w", newline="", encoding="utf-8") as f:
    csv.writer(f).writerows(out)

print(f"rows={len(out)-1} changed={n_set}")
# sanity dump of our types' selection rows
for r in out[1:]:
    if r[0].startswith("PSL_DATA_TYPES_") and r[2] == "true":
        print("SELECTED:", r[1])
