"""Genera index.html y agencias.csv a partir de agencias.json.

Uso: python build.py
"""
import csv
import json
from html import escape
from pathlib import Path

HERE = Path(__file__).parent
REGIONS = {
    "es-latam": "España y Latinoamérica",
    "uk-eu": "Reino Unido y Europa",
    "us": "Estados Unidos y Asia-Pacífico",
}
CSV_COLUMNS = [
    "id", "nombre", "region", "pais", "territorios", "tamano",
    "marcas_similares", "senales_emergentes", "condiciones",
    "contacto_general", "persona_contacto", "por_que_encaja", "riesgo",
    "puntuacion", "top5", "fuentes",
]


def e(text):
    return escape(str(text or ""))


def link(text, url):
    if not url:
        return e(text)
    return f'<a href="{e(url)}" target="_blank" rel="noopener">{e(text)}</a>'


def items_html(items):
    if not items:
        return "<p class='muted'>Sin datos verificados.</p>"
    lis = []
    for it in items:
        label = link(it["name"], it.get("url")) if it.get("name") else ""
        note = e(it.get("note", ""))
        if label and note:
            lis.append(f"<li><b>{label}</b> — {note}</li>")
        elif label:
            lis.append(f"<li><b>{label}</b></li>")
        else:
            lis.append(f"<li>{note} {source_tag(it.get('url'))}</li>")
    return "<ul>" + "".join(lis) + "</ul>"


def source_tag(url):
    return f'<a class="src" href="{e(url)}" target="_blank" rel="noopener">[fuente]</a>' if url else ""


def contact_html(c):
    parts = []
    if c.get("email"):
        parts.append(f'<a href="mailto:{e(c["email"])}">{e(c["email"])}</a>')
    if c.get("form"):
        parts.append(link("formulario / web de contacto", c["form"]))
    if c.get("phone"):
        parts.append(e(c["phone"]))
    out = " · ".join(parts) or "<span class='muted'>no publicado</span>"
    if c.get("person"):
        out += f"<br><b>Persona:</b> {e(c['person'])} {source_tag(c.get('person_url'))}"
    return out


def top_rank(data):
    return {t["id"]: t["rank"] for t in data["top5"]}


def agency_card(a, rank):
    badge = f'<span class="badge top">Top {rank}</span>' if rank else ""
    return f"""
<article class="card" id="{e(a['id'])}" data-region="{e(a['region'])}">
  <header>
    <h3>{link(a['name'], a.get('web'))} {badge}</h3>
    <div class="score" title="Encaje con Naolito (1-10)">{e(a['score'])}<small>/10</small></div>
  </header>
  <p class="meta"><b>{e(a['country'])}</b> · Territorios: {e(a['territories'])}</p>
  <p class="meta">Tamaño: {e(a['size'])} {source_tag(a.get('size_url'))}</p>
  <details open><summary>Marcas parecidas a Naolito</summary>{items_html(a.get('similar_brands'))}</details>
  <details><summary>Señales de que coge marcas emergentes o medianas</summary>{items_html(a.get('emerging_signals'))}</details>
  <details><summary>Condiciones</summary><p>{e(a.get('terms') or 'No públicas.')}</p></details>
  <details open><summary>Contacto</summary><p>{contact_html(a.get('contact', {}))}</p></details>
  <div class="fit"><p><b>Por qué encaja:</b> {e(a['fit'])}</p><p><b>Riesgo:</b> {e(a['risk'])}</p></div>
</article>"""


def table_html(data, ranks):
    rows = []
    for a in sorted(data["agencies"], key=lambda x: -x["score"]):
        rows.append(
            f"<tr data-region='{e(a['region'])}'><td><a href='#{e(a['id'])}'>{e(a['name'])}</a></td>"
            f"<td>{e(REGIONS[a['region']])}</td><td>{e(a['country'])}</td>"
            f"<td>{e(a['territories'])}</td><td class='num'>{e(a['score'])}</td>"
            f"<td>{'Top ' + str(ranks[a['id']]) if a['id'] in ranks else ''}</td></tr>"
        )
    return (
        "<table><thead><tr><th>Agencia</th><th>Región</th><th>País</th>"
        "<th>Territorios</th><th>Encaje</th><th></th></tr></thead><tbody>"
        + "".join(rows) + "</tbody></table>"
    )


def top5_html(data):
    by_id = {a["id"]: a for a in data["agencies"]}
    lis = []
    for t in sorted(data["top5"], key=lambda x: x["rank"]):
        a = by_id[t["id"]]
        lis.append(
            f"<li><h3><a href='#{e(a['id'])}'>{e(a['name'])}</a> "
            f"<span class='terr'>{e(t['territory'])}</span></h3><p>{e(t['reason'])}</p>"
            f"<p class='meta'><b>Primer contacto:</b> {contact_html(a.get('contact', {}))}</p></li>"
        )
    return "<ol class='top5'>" + "".join(lis) + "</ol>"


def discarded_html(data):
    lis = [
        f"<li><b>{e(d['name'])}</b> — {e(d['reason'])} {source_tag(d.get('url'))}</li>"
        for d in data.get("discarded", [])
    ]
    return "<ul>" + "".join(lis) + "</ul>"


def build_html(data):
    ranks = top_rank(data)
    sections = []
    for key, title in REGIONS.items():
        cards = [agency_card(a, ranks.get(a["id"])) for a in data["agencies"] if a["region"] == key]
        if cards:
            sections.append(f"<section class='region' id='r-{key}'><h2>{e(title)} <small>({len(cards)})</small></h2>"
                            f"<div class='grid'>{''.join(cards)}</div></section>")
    paragraphs = "".join(f"<p>{e(p)}</p>" for p in data["recommendation"])
    method = "".join(f"<li>{e(m)}</li>" for m in data.get("method", []))
    template = (HERE / "template.html").read_text(encoding="utf-8")
    return (template
            .replace("{{DATE}}", e(data["generated"]))
            .replace("{{COUNT}}", str(len(data["agencies"])))
            .replace("{{SUMMARY}}", e(data.get("summary", "")))
            .replace("{{TOP5}}", top5_html(data))
            .replace("{{RECOMMENDATION}}", paragraphs)
            .replace("{{TABLE}}", table_html(data, ranks))
            .replace("{{SECTIONS}}", "".join(sections))
            .replace("{{DISCARDED}}", discarded_html(data))
            .replace("{{METHOD}}", method))


def flat(items):
    out = []
    for it in items or []:
        txt = " — ".join(x for x in (it.get("name"), it.get("note")) if x)
        out.append(f"{txt} ({it['url']})" if it.get("url") else txt)
    return " | ".join(out)


def build_csv(data, path):
    ranks = top_rank(data)
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(CSV_COLUMNS)
        for a in sorted(data["agencies"], key=lambda x: -x["score"]):
            c = a.get("contact", {})
            general = " | ".join(x for x in (c.get("email"), c.get("form"), c.get("phone")) if x)
            urls = {a.get("web"), a.get("size_url"), c.get("person_url")}
            urls |= {it.get("url") for it in a.get("similar_brands", []) + a.get("emerging_signals", [])}
            w.writerow([
                a["id"], a["name"], REGIONS[a["region"]], a["country"], a["territories"], a["size"],
                flat(a.get("similar_brands")), flat(a.get("emerging_signals")),
                a.get("terms") or "No públicas", general, c.get("person", ""),
                a["fit"], a["risk"], a["score"], ranks.get(a["id"], ""),
                " | ".join(sorted(u for u in urls if u)),
            ])


def main():
    data = json.loads((HERE / "agencias.json").read_text(encoding="utf-8"))
    (HERE / "index.html").write_text(build_html(data), encoding="utf-8")
    build_csv(data, HERE / "agencias.csv")
    print(f"OK: {len(data['agencies'])} agencias -> index.html, agencias.csv")


if __name__ == "__main__":
    main()
