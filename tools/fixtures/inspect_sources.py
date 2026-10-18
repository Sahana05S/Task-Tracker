"""Read-only XLSX structure/anchor inspection using Python's standard library.

Does not evaluate formulas, open Excel, alter sources or print business rows.
Usage: python tools/fixtures/inspect_sources.py PATH [--sheet NAME --cells A1 B2]
"""
import argparse
import hashlib
import json
import posixpath
import xml.etree.ElementTree as ET
import zipfile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def inspect(path, sheet=None, cells=()):
    with open(path, "rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest() if hasattr(hashlib, "file_digest") else hashlib.sha256(source.read()).hexdigest()
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {r.get("Id"): r.get("Target") for r in relationships}
        sheets = {s.get("name"): posixpath.normpath("xl/" + targets[s.get(RID)]) if not targets[s.get(RID)].startswith("/") else targets[s.get(RID)].lstrip("/") for s in workbook.find("s:sheets", NS)}
        result = {"file": str(path), "sha256": digest, "sheets": list(sheets), "defined_names": {n.get("name"): n.text for n in workbook.findall("s:definedNames/s:definedName", NS)}}
        if sheet:
            strings = []
            if "xl/sharedStrings.xml" in archive.namelist():
                strings = ["".join(si.itertext()) for si in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
            root = ET.fromstring(archive.read(sheets[sheet]))
            selected = {}
            for c in root.findall("s:sheetData/s:row/s:c", NS):
                if c.get("r") not in cells:
                    continue
                v, f = c.find("s:v", NS), c.find("s:f", NS)
                value = v.text if v is not None else None
                if c.get("t") == "s" and value is not None:
                    value = strings[int(value)]
                elif c.get("t") == "inlineStr":
                    value = "".join(c.find("s:is", NS).itertext())
                # Formula caches can contain private data; only formula text is output.
                selected[c.get("r")] = {"formula": f.text} if f is not None else {"value": value}
            result = {"file": str(path), "sha256": digest, "sheet": sheet, "cells": selected, "validations": [{"range": v.get("sqref"), "type": v.get("type"), "formula": v.findtext("s:formula1", namespaces=NS)} for v in root.findall("s:dataValidations/s:dataValidation", NS)]}
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path")
    parser.add_argument("--sheet")
    parser.add_argument("--cells", nargs="*", default=[])
    args = parser.parse_args()
    print(json.dumps(inspect(args.path, args.sheet, args.cells), ensure_ascii=False, indent=2))
