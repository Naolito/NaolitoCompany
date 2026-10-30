"""Build the Naolito licensing dossier (EN + ES) as self-contained HTML and PDF.

Usage:  python build.py            # HTML + PDF
        python build.py --no-pdf   # HTML only

Sources live next to this script:
  content_en.json / content_es.json   texts, figures and their sources
  template.html.j2                    page layout
  styles.css                          inlined into the HTML
  fonts/                              Fredoka and Nunito (OFL), embedded so every reader sees them
  img/                                art, logos and photos (embedded as data URIs)
"""
import base64
import io
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape
from PIL import Image

SRC = Path(__file__).resolve().parent
OUT = SRC.parent
MAX_SIDE = 2000
OUTPUTS = {
    "en": "naolito-licensing-dossier-en",
    "es": "naolito-dossier-licencias-es",
}
GAP_RE = re.compile(r"\[(?:COMPLETAR|TO COMPLETE):[^\]]*\]")
CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "google-chrome",
    "chromium",
]

_image_cache = {}


def data_uri(rel_path):
    """Return an embedded, size-capped data URI for an image under img/."""
    if rel_path in _image_cache:
        return _image_cache[rel_path]
    path = SRC / "img" / rel_path
    if not path.is_file():
        raise FileNotFoundError(f"Missing image: {path}")
    if path.suffix == ".svg":
        uri = f"data:image/svg+xml;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"
        _image_cache[rel_path] = uri
        return uri
    im = Image.open(path)
    im.load()
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    if has_alpha:
        im.convert("RGBA").save(buf, "PNG", optimize=True)
        mime = "image/png"
    else:
        im.convert("RGB").save(buf, "JPEG", quality=82, optimize=True, progressive=True)
        mime = "image/jpeg"
    uri = f"data:{mime};base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"
    _image_cache[rel_path] = uri
    return uri


def mark_gaps(text):
    """Escape text and highlight the [COMPLETAR: ...] / [TO COMPLETE: ...] placeholders."""
    escaped = str(escape(text))
    return Markup(GAP_RE.sub(lambda m: f'<span class="gap">{m.group(0)}</span>', escaped))


def rich(text):
    """Like mark_gaps, plus **bold** and *italic* for emphasis inside JSON strings."""
    html = str(mark_gaps(text))
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
    return Markup(re.sub(r"\*(.+?)\*", r"<em>\1</em>", html))


def collect_gaps(node, found):
    if isinstance(node, str):
        found.extend(GAP_RE.findall(node))
    elif isinstance(node, dict):
        for value in node.values():
            collect_gaps(value, found)
    elif isinstance(node, list):
        for value in node:
            collect_gaps(value, found)
    return found


def font_faces():
    """Embed the fonts so the HTML and PDF look the same on any computer."""
    faces = []
    for name in ("Fredoka", "Nunito"):
        data = base64.b64encode((SRC / "fonts" / f"{name.lower()}.woff2").read_bytes()).decode("ascii")
        faces.append(
            f'@font-face {{ font-family: "{name}"; font-weight: 300 900; '
            f'src: url(data:font/woff2;base64,{data}) format("woff2"); }}'
        )
    return "\n".join(faces)


def visible_words(node, skip=("img", "hero", "logo", "disney", "url", "title_tag")):
    """Count the words a reader sees, leaving out the sources page and the metadata."""
    if isinstance(node, str):
        return len(node.split())
    if isinstance(node, list):
        return sum(visible_words(v, skip) for v in node)
    if isinstance(node, dict):
        return sum(visible_words(v, skip) for k, v in node.items() if k not in skip)
    return 0


def find_chrome():
    for candidate in CHROME_CANDIDATES:
        if os.path.isfile(candidate) or shutil.which(candidate):
            return candidate
    return None


def print_pdf(html_path, pdf_path):
    chrome = find_chrome()
    if not chrome:
        print("  ! Chrome/Edge not found: PDF skipped")
        return False
    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        "--virtual-time-budget=5000",
        f"--print-to-pdf={pdf_path}",
        html_path.as_uri(),
    ]
    subprocess.run(cmd, check=True, capture_output=True, timeout=180)
    return pdf_path.is_file()


def build(lang, env, css, make_pdf):
    content = json.loads((SRC / f"content_{lang}.json").read_text(encoding="utf-8"))
    html = env.get_template("template.html.j2").render(c=content, css=Markup(css), lang=lang)
    html_path = OUT / f"{OUTPUTS[lang]}.html"
    html_path.write_text(html, encoding="utf-8")
    size_mb = html_path.stat().st_size / 1e6
    print(f"  {html_path.name}  ({size_mb:.1f} MB)")
    if make_pdf:
        pdf_path = OUT / f"{OUTPUTS[lang]}.pdf"
        if print_pdf(html_path, pdf_path):
            print(f"  {pdf_path.name}  ({pdf_path.stat().st_size / 1e6:.1f} MB)")
    words = visible_words({k: v for k, v in content.items() if k not in ("meta", "sources")})
    print(f"  {words} words without the sources page")
    gaps = collect_gaps(content, [])
    return sorted(set(gaps), key=gaps.index)


def main():
    make_pdf = "--no-pdf" not in sys.argv
    env = Environment(
        loader=FileSystemLoader(SRC),
        autoescape=select_autoescape(["html", "j2"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["gaps"] = mark_gaps
    env.filters["rich"] = rich
    env.globals["img"] = data_uri
    css = font_faces() + "\n" + (SRC / "styles.css").read_text(encoding="utf-8")
    for lang in OUTPUTS:
        print(f"[{lang}]")
        gaps = build(lang, env, css, make_pdf)
        print(f"  {len(gaps)} placeholders to complete")
        for gap in gaps:
            print(f"    - {gap}")


if __name__ == "__main__":
    main()
