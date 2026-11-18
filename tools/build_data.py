#!/usr/bin/env python3
"""
Genera js/data.js (catalogo + stock + sesiones) y actualiza el bloque STOCK de
apps-script/Code.gs a partir de:
  - ../LISTADO BICIS DE TEST SCOTT EXPERIENCE 2027.xlsx  (unidades por modelo y talla)
  - ../Pricat_ss27_scott_bici.csv                         (nombre oficial, color, referencia)

Uso:  python3 -I tools/build_data.py
"""
import csv, json, re, zipfile, sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT.parent
XLSX = SRC / "LISTADO BICIS DE TEST SCOTT EXPERIENCE 2027.xlsx"
PRICAT = SRC / "Pricat_ss27_scott_bici.csv"

# Modelo del Excel  ->  (tipo, familia, nombre corto, Art. Codigo pricat, Color Codigo pricat, foto local)
# Decisiones acordadas con el cliente: Team Issue en negro (Carbon Black); gravel 20 "amarilla"
# -> Mojito Green; gravel 10 "camo" -> Lupine Grey.
MAPPING = OrderedDict([
    ("spark rc team issue",       ("mtb",    "Spark RC", "Team Issue",   "427545", "3020", "team-issue-carbon-black.jpg")),
    ("spark rc world cup evo",    ("mtb",    "Spark RC", "World Cup EVO", "427543", "8575", "world-cup-evo-rush-white.jpg")),
    ("spark rc world cup",        ("mtb",    "Spark RC", "World Cup",     "427544", "8086", "world-cup-cumulus-white.jpg")),
    ("addict gravel 20 negra",    ("gravel", "Addict Gravel", "20",       "427614", "8600", "gravel-20-watery-black.jpg")),
    ("addict gravel 20 amarilla", ("gravel", "Addict Gravel", "20",       "427614", "8554", "gravel-20-mojito-green.jpg")),
    ("addict gravel 10 camo",     ("gravel", "Addict Gravel", "10",       "427613", "8547", "gravel-10-lupine-grey.jpg")),
])
SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL"]


def read_xlsx_rows(path):
    z = zipfile.ZipFile(path)
    ss = z.read("xl/sharedStrings.xml").decode("utf-8")
    strings = [re.sub(r"<[^>]+>", "", s) for s in re.findall(r"<si>(.*?)</si>", ss, re.S)]
    x = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
    out = []
    for row in re.findall(r"<row[^>]*>(.*?)</row>", x, re.S):
        cells = {}
        for m in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', row, re.S):
            col, attrs, inner = m.groups()
            v = re.search(r"<v>(.*?)</v>", inner or "")
            if v:
                val = v.group(1)
                if 't="s"' in attrs:
                    val = strings[int(val)]
                cells[col] = val.strip()
        out.append(cells)
    return out


def main():
    # 1) stock desde el Excel: C = modelo, D = talla, E = unidades
    stock = {k: {} for k in MAPPING}
    pedal = {}
    for cells in read_xlsx_rows(XLSX):
        model = cells.get("C", "").strip().lower()
        if model not in MAPPING:
            continue
        size = cells.get("D", "").strip().upper()
        qty = int(float(cells.get("E", "1") or 1))
        stock[model][size] = stock[model].get(size, 0) + qty
        if cells.get("F"):
            pedal[model] = cells["F"]

    # 2) datos oficiales desde el pricat
    pricat = list(csv.DictReader(open(PRICAT, encoding="utf-8-sig"), delimiter=";"))
    bikes = []
    for key, (typ, family, short, art, color, img) in MAPPING.items():
        rows = [r for r in pricat if r["Art. Codigo"] == art and r["Color Codigo"] == color]
        if not rows:
            sys.exit(f"No esta en el pricat: {key} ({art}/{color})")
        available_sizes = {r["Talla"].upper() for r in rows}
        for s in stock[key]:
            if s not in available_sizes:
                sys.exit(f"Talla {s} de {key} no existe en el pricat ({sorted(available_sizes)})")
        r0 = rows[0]
        sizes = OrderedDict((s, stock[key][s]) for s in SIZE_ORDER if s in stock[key])
        bikes.append(OrderedDict([
            ("id", f"{typ}-" + re.sub(r"[^a-z0-9]+", "-", f"{short}-{r0['Color Nombre']}".lower()).strip("-")),
            ("type", typ),
            ("family", family),
            ("name", short),
            ("color", r0["Color Nombre"].title().replace("/", " / ")),
            ("sku", art + color),
            ("pvpSeason", r0["Temporada"]),
            ("img", f"assets/img/bikes/{img}"),
            ("pedal", pedal.get(key, "SPD")),
            ("sizes", sizes),
        ]))

    # 3) sesiones: un test de MTB y uno de gravel por dia/tienda
    days = [
        ("2026-12-11", "Viernes", "Algeciras", "Special Bikes"),
        ("2026-12-12", "Sábado",  "Málaga",    "Bike Philosophy"),
        ("2026-12-13", "Domingo", "Málaga",    "Bike Philosophy"),
        ("2026-12-14", "Lunes",   "Córdoba",   "Córdoba Bike"),
        ("2026-12-15", "Martes",  "Andújar",   "Kanina Bikes Andújar"),
    ]
    # Cada test dura entre 1 h y 1 h 30 min; hay que presentarse ARRIVE_MIN minutos antes del inicio.
    ARRIVE_MIN = 30
    # Enlaces de Google Maps de cada tienda (facilitados por el cliente)
    MAPS = {
        "Special Bikes":        "https://maps.app.goo.gl/Sm2qDsy3iYJcYGqA6",
        "Bike Philosophy":      "https://maps.app.goo.gl/jEWQp1VuHFSCoQHi9",
        "Córdoba Bike":         "https://maps.app.goo.gl/A6LpH7HkqhRABzZA7",
        "Kanina Bikes Andújar": "https://maps.app.goo.gl/7miXMEmDyBrKGWtb8",
    }
    tests = [("mtb", "Mañana", "09:30", "11:00"), ("gravel", "Mañana", "11:30", "13:00")]
    # Bike Philosophy (Málaga): por turnos. En cada turno hay a la vez una salida de MTB (Spark RC) y otra de gravel (Addict Gravel).
    # Sábado 12: 3 turnos de hasta 1 h 30 min. Domingo 13: 3 turnos de 1 h (reservas bloqueadas desde Code.gs: BLOCKED_DATES).
    turns = {
        "2026-12-12": [("10:00", "11:30"), ("12:00", "13:30"), ("15:00", "16:30")],
        "2026-12-13": [("10:00", "11:00"), ("11:30", "12:30"), ("13:00", "14:00")],
    }

    def period_of(start):
        h = int(start.split(":")[0])
        return "Mañana" if h < 12 else ("Mediodía" if h < 15 else "Tarde")

    def minus(hm, minutes):
        h, m = map(int, hm.split(":"))
        t = h * 60 + m - minutes
        return f"{t // 60:02d}:{t % 60:02d}"

    sessions = []
    for date, weekday, city, store in days:
        slug = re.sub(r"[^a-z0-9]+", "-", city.lower().replace("ú", "u").replace("á", "a").replace("ó", "o"))
        if date in turns:
            day_tests = [(typ, period_of(st), st, en) for st, en in turns[date] for typ in ("mtb", "gravel")]
        else:
            day_tests = sorted(tests, key=lambda t: t[2])
        for typ, period, start, end in day_tests:
            sessions.append(OrderedDict([
                ("id", f"{date}_{slug}_{typ}_{start.replace(':', '')}"),
                ("date", date), ("weekday", weekday), ("city", city), ("store", store),
                ("type", typ), ("period", period), ("start", start), ("end", end),
                ("arrive", minus(start, ARRIVE_MIN)),
                ("mapUrl", MAPS[store]),
            ]))

    # Logos de tienda (PNG convertidos desde los TIFF "logo <tienda>.tiff" de la carpeta del proyecto).
    # Bike Philosophy y Cordoba Bike traen fondo negro propio -> baldosa negra; los otros son transparentes -> baldosa blanca.
    # (logo, color de la baldosa, enlace de Google Maps facilitado por el cliente)
    logos = {
        "Special Bikes":        ("assets/img/stores/special-bikes.png", "#ffffff"),
        "Bike Philosophy":      ("assets/img/stores/bike-philosophy.png", "#000000"),
        "Córdoba Bike":         ("assets/img/stores/cordoba-bike.png", "#000000"),
        "Kanina Bikes Andújar": ("assets/img/stores/kanina-bikes.png", "#ffffff"),
    }
    day_list = []
    for d, w, c, s in days:
        logo, bg = logos[s]
        maps = MAPS[s]
        day_list.append(OrderedDict([("date", d), ("weekday", w), ("city", c), ("store", s), ("logo", logo), ("logoBg", bg), ("mapUrl", maps)]))
    # Guia de tallas oficial SCOTT (archivos "guia tallas spark rc.tiff" y "guia tallas addict gravel.tiff").
    # Rangos de altura (cm) medidos sobre los pixeles de cada grafico: [desde, hasta]; None = sin limite en el grafico.
    # Las tallas contiguas se solapan, igual que en el grafico oficial. Son rangos orientativos.
    size_guide = OrderedDict([
        ("mtb", OrderedDict([
            ("label", "Spark RC"),
            ("img", "assets/img/guides/spark-rc-tallas.png"),
            ("ranges", OrderedDict([("S", [158, 173]), ("M", [168, 180]), ("L", [178, 193]), ("XL", [185, 198])])),
        ])),
        ("gravel", OrderedDict([
            ("label", "Addict Gravel"),
            ("img", "assets/img/guides/addict-gravel-tallas.png"),
            ("ranges", OrderedDict([("XXS", [None, 162]), ("XS", [158, 167]), ("S", [163, 173]), ("M", [170, 178]),
                                    ("L", [177, 187]), ("XL", [185, 197]), ("XXL", [193, None])])),
        ])),
    ])
    data = OrderedDict([("bikes", bikes), ("sessions", sessions), ("days", day_list), ("sizeGuide", size_guide)])
    js = "/* GENERADO por tools/build_data.py - no editar a mano */\nwindow.SCOTT_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    (ROOT / "js" / "data.js").write_text(js, encoding="utf-8")

    # 4) bloque STOCK de Apps Script (mismos datos: el servidor no se fia del navegador)
    gs_stock = {b["id"]: dict(b["sizes"]) for b in bikes}
    gs_sessions = {s["id"]: {"type": s["type"], "date": s["date"], "city": s["city"], "store": s["store"],
                             "start": s["start"], "end": s["end"], "arrive": s["arrive"], "map": s["mapUrl"]} for s in sessions}
    gs_bikes = {b["id"]: {"type": b["type"], "label": f'{b["family"]} {b["name"]} · {b["color"]}'} for b in bikes}
    block = ("// <STOCK-BEGIN> generado por tools/build_data.py\n"
             f"var STOCK = {json.dumps(gs_stock, ensure_ascii=False)};\n"
             f"var BIKES = {json.dumps(gs_bikes, ensure_ascii=False)};\n"
             f"var SESSIONS = {json.dumps(gs_sessions, ensure_ascii=False)};\n"
             "// <STOCK-END>")
    gs_path = ROOT / "apps-script" / "Code.gs"
    if gs_path.exists():
        src = gs_path.read_text(encoding="utf-8")
        new = re.sub(r"// <STOCK-BEGIN>.*?// <STOCK-END>", lambda m: block, src, flags=re.S)
        gs_path.write_text(new, encoding="utf-8")

    print("Bicis:", len(bikes), "| unidades MTB:", sum(sum(b["sizes"].values()) for b in bikes if b["type"] == "mtb"),
          "| unidades gravel:", sum(sum(b["sizes"].values()) for b in bikes if b["type"] == "gravel"))
    for b in bikes:
        print(f'  {b["id"]:45s} {dict(b["sizes"])}')


if __name__ == "__main__":
    main()
