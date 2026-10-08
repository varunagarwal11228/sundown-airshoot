"""
Packs the game into ONE self-contained HTML file (dist/SundownAirshoot.html)
that runs by double-click: no server, no internet, no install.

How: every ES module (game code + three.js) is rewritten so its imports use
bare specifiers like "@sp/src/game/Game.js", then embedded as a base64
data: URL inside an import map. Fonts and the icon are inlined the same way.

    python tools/build.py
"""

import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
ENTRY = ROOT / "src" / "main.js"

ALIASES = {
    "three": ROOT / "vendor" / "three" / "three.module.js",
}
ADDONS_PREFIX = "three/addons/"
ADDONS_DIR = ROOT / "vendor" / "three" / "addons"

SPEC_RE = re.compile(r"""(\bfrom\s*|\bimport\s*)(['"])([^'"\n]+)\2""")


def key_for(path: Path) -> str:
    return "@sp/" + path.relative_to(ROOT).as_posix()


def resolve(spec: str, importer: Path):
    if spec in ALIASES:
        return ALIASES[spec]
    if spec.startswith(ADDONS_PREFIX):
        return ADDONS_DIR / spec[len(ADDONS_PREFIX):]
    if spec.startswith("./") or spec.startswith("../"):
        return (importer.parent / spec).resolve()
    return None


def data_url(mime: str, raw: bytes) -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def collect(entry: Path):
    modules = {}
    stack = [entry.resolve()]
    while stack:
        path = stack.pop()
        if path in modules:
            continue
        src = path.read_text(encoding="utf-8")

        def rewrite(m):
            target = resolve(m.group(3), path)
            # Unknown targets are almost always doc comments; leave them be.
            if target is None or not target.exists():
                return m.group(0)
            stack.append(target)
            return f"{m.group(1)}{m.group(2)}{key_for(target)}{m.group(2)}"

        modules[path] = SPEC_RE.sub(rewrite, src)
    return modules


def build():
    modules = collect(ENTRY)
    imports = {key_for(p): data_url("text/javascript", code.encode("utf-8")) for p, code in modules.items()}
    imports["three"] = imports[key_for(ALIASES["three"])]
    importmap = json.dumps({"imports": imports}, separators=(",", ":"))

    css = (ROOT / "styles" / "main.css").read_text(encoding="utf-8")

    def inline_font(m):
        font = (ROOT / "styles" / m.group(1)).resolve()
        return f'url("{data_url("font/woff2", font.read_bytes())}")'

    css = re.sub(r'url\("(\.\./assets/fonts/[^"]+)"\)', inline_font, css)

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    icon = data_url("image/svg+xml", (ROOT / "assets" / "icon.svg").read_bytes())
    html = html.replace('href="assets/icon.svg"', f'href="{icon}"')
    # The web app manifest only works when the game is hosted; from a local
    # file it would just log an error, so the single-file build drops it.
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
    html = html.replace('<link rel="stylesheet" href="styles/main.css">', f"<style>\n{css}\n</style>")
    html = re.sub(
        r'<script type="importmap">.*?</script>',
        lambda _: f'<script type="importmap">{importmap}</script>',
        html,
        flags=re.S,
    )
    html = html.replace(
        '<script type="module" src="src/main.js"></script>',
        f'<script type="module">import "{key_for(ENTRY.resolve())}";</script>',
    )

    DIST.mkdir(exist_ok=True)
    out = DIST / "SundownAirshoot.html"
    out.write_text(html, encoding="utf-8")
    print(f"built {out.relative_to(ROOT)}  ({len(modules)} modules, {out.stat().st_size / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    sys.exit(build())
