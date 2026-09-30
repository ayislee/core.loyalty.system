from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
import re

root = Path(__file__).resolve().parent
source = root / "NOTULENSI_EVALUASI_MARKETPLACE.md"
target = root / "NOTULENSI_EVALUASI_MARKETPLACE.docx"
w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def runs(text, bold=False):
    result = []
    for part in re.split(r"(\*\*.*?\*\*|`[^`]+`)", text):
        if not part:
            continue
        is_bold, is_code = bold, False
        if part.startswith("**") and part.endswith("**"):
            part, is_bold = part[2:-2], True
        elif part.startswith("`") and part.endswith("`"):
            part, is_code = part[1:-1], True
        props = []
        if is_bold:
            props.append("<w:b/>")
        if is_code:
            props.extend(['<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>', '<w:color w:val="7A1F5C"/>', '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>'])
        rpr = f"<w:rPr>{''.join(props)}</w:rPr>" if props else ""
        preserve = ' xml:space="preserve"' if part[:1].isspace() or part[-1:].isspace() else ""
        result.append(f"<w:r>{rpr}<w:t{preserve}>{escape(part)}</w:t></w:r>")
    return "".join(result)


def paragraph(text="", style=None, bullet=False, numbered=False, bold=False, keep=False):
    props = []
    if style:
        props.append(f'<w:pStyle w:val="{style}"/>')
    if bullet:
        props.append('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')
    if numbered:
        props.append('<w:ind w:left="600" w:hanging="360"/>')
    if keep:
        props.append("<w:keepNext/>")
    ppr = f"<w:pPr>{''.join(props)}</w:pPr>" if props else ""
    return f"<w:p>{ppr}{runs(text, bold)}</w:p>"


def make_table(rows):
    count = max(len(row) for row in rows)
    width = max(900, 9360 // count)
    grid = "".join(f'<w:gridCol w:w="{width}"/>' for _ in range(count))
    output = []
    for row_index, row in enumerate(rows):
        cells = []
        for value in row + [""] * (count - len(row)):
            shade = '<w:shd w:val="clear" w:color="auto" w:fill="D9EAF7"/>' if row_index == 0 else ""
            cell_props = f'<w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{shade}<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>'
            cells.append(f"<w:tc>{cell_props}{paragraph(value, bold=(row_index == 0))}</w:tc>")
        output.append(f"<w:tr>{''.join(cells)}</w:tr>")
    borders = ''.join(f'<w:{side} w:val="single" w:sz="4" w:color="B7C9D6"/>' for side in ["top", "left", "bottom", "right", "insideH", "insideV"])
    return f'<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>{borders}</w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>{"".join(output)}</w:tbl>'


def body_from_markdown(markdown):
    lines, body, index, first = markdown.splitlines(), [], 0, True
    while index < len(lines):
        line = lines[index].rstrip()
        if not line:
            index += 1
            continue
        if line.startswith("|"):
            raw = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                raw.append([cell.strip() for cell in lines[index].strip().strip("|").split("|")])
                index += 1
            rows = [row for row in raw if not all(re.fullmatch(r":?-{3,}:?", cell or "") for cell in row)]
            body.extend([make_table(rows), paragraph()])
            continue
        heading = re.match(r"^(#{1,3})\s+(.*)$", line)
        if heading:
            level = len(heading.group(1))
            style = "Title" if first and level == 1 else f"Heading{level}"
            body.append(paragraph(heading.group(2), style=style, keep=True))
            first, index = False, index + 1
            continue
        if re.match(r"^\d+\.\s+", line):
            body.append(paragraph(line, numbered=True))
        elif re.match(r"^-\s+", line):
            body.append(paragraph(re.sub(r"^-\s+", "", line), bullet=True))
        else:
            body.append(paragraph(line))
        index += 1
    return "".join(body)


with ZipFile(target, "r") as archive:
    parts = {name: archive.read(name) for name in archive.namelist()}

body = body_from_markdown(source.read_text(encoding="utf-8"))
document = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="{w}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>{body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="900" w:bottom="1080" w:left="900" w:header="500" w:footer="500" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>'''
ET.fromstring(document.encode("utf-8"))
parts["word/document.xml"] = document.encode("utf-8")

temporary = target.with_suffix(".docx.tmp")
with ZipFile(temporary, "w", compression=ZIP_DEFLATED) as archive:
    for name, data in parts.items():
        archive.writestr(name, data)
try:
    temporary.replace(target)
except PermissionError:
    target = root / "NOTULENSI_EVALUASI_MARKETPLACE_UPDATED.docx"
    temporary.replace(target)

with ZipFile(target, "r") as archive:
    if archive.testzip():
        raise RuntimeError("DOCX package validation failed")
    for name in archive.namelist():
        if name.endswith(".xml") or name.endswith(".rels"):
            ET.fromstring(archive.read(name))

print(f"Refreshed and validated: {target}")
print(f"Size: {target.stat().st_size} bytes")
