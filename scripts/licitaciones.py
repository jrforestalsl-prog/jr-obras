"""Descarga licitaciones abiertas de la Plataforma de Contratación del Sector Público
(feeds ATOM oficiales), se queda con las de Asturias relacionadas con trabajos forestales,
desbroces, podas, cierres, jardinería y movimiento de tierras, y guarda licitaciones.json."""
import datetime, json, re, sys, urllib.request
import xml.etree.ElementTree as ET

FEEDS = [
    "https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom",
    "https://contrataciondelestado.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom",
]
MAX_PAGES = 60
DIAS_ATRAS = 60
CPV_OK = ("0311", "0341", "0342", "0343", "0344", "0345", "772", "7731", "7734", "7790",
          "4511", "4523", "4534", "4526", "9061", "7720")
KW = ["desbroce", "desbroz", "limpieza de monte", "limpieza de fincas", "forestal", "tala", "poda", "arbolado",
      "arbol", "vallado", "cierre perimetral", "cercado", "jardin", "zonas verdes", "parques", "movimiento de tierras",
      "excavaci", "caminos", "pista", "incendio", "franja", "biomasa", "repoblaci", "maleza", "cuneta", "margen",
      "silvicola", "selvicola", "monte", "matorral", "rozas", "roza", "siega"]
CONCEJOS = """allande aller amieva aviles belmonte bimenes boal cabrales cabranes candamo cangas castrillon castropol
coaña colunga corvera cudillero degaña franco gijon gozon grado grandas ibias illano illas langreo laviana lena llanera
llanes mieres morcin muros nava navia noreña onis oviedo parres peñamellera pesoz piloña ponga pravia proaza quiros
regueras ribadedeva ribadesella ribera riosa salas sariego siero sobrescobio somiedo soto tapia taramundi teverga tineo
valdes vegadeo villanueva villaviciosa villayon yernes carreño caravia caso eilao santalla""".split()
UA = {"User-Agent": "jr-obras-licitaciones/1.0 (+https://github.com/jrforestalsl-prog/jr-obras)"}


def ln(tag):
    return tag.rsplit("}", 1)[-1]


def first(el, name):
    if el is None:
        return None
    for e in el.iter():
        if ln(e.tag) == name:
            return e
    return None


def texts(el, name):
    return [e.text.strip() for e in el.iter() if ln(e.tag) == name and e.text] if el is not None else []


def txt(el):
    return el.text.strip() if el is not None and el.text else ""


def norm(s):
    s = s.lower()
    for a, b in zip("áéíóúüàèìòù", "aeiouuaeiou"):
        s = s.replace(a, b)
    return s


def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    hoy = datetime.date.today()
    limite = hoy - datetime.timedelta(days=DIAS_ATRAS)
    vistos, items = set(), []
    for feed in FEEDS:
        url, pages = feed, 0
        while url and pages < MAX_PAGES:
            pages += 1
            try:
                root = ET.fromstring(fetch(url))
            except Exception as e:  # noqa: BLE001
                print("Error en", url, e, file=sys.stderr)
                break
            viejo = False
            for entry in [e for e in root if ln(e.tag) == "entry"]:
                upd = txt(first(entry, "updated"))[:10]
                if upd and upd < limite.isoformat():
                    viejo = True
                    continue
                cfs = first(entry, "ContractFolderStatus")
                if cfs is None:
                    continue
                estado = txt(first(cfs, "ContractFolderStatusCode"))
                if estado and estado not in ("PUB", "EV"):
                    continue
                titulo = txt(first(entry, "title"))
                link_el = first(entry, "link")
                enlace = link_el.get("href") if link_el is not None else ""
                ident = txt(first(entry, "id")) or enlace
                if ident in vistos:
                    continue
                org = txt(first(first(cfs, "LocatedContractingParty"), "Name"))
                nuts = texts(cfs, "CountrySubentityCode")
                lugares = texts(cfs, "CityName") + texts(cfs, "CountrySubentity")
                donde = norm(" ".join([org] + lugares))
                asturias = any(n.startswith("ES12") for n in nuts) or "asturias" in donde or any(
                    re.search(r"\b" + c + r"\b", donde) for c in CONCEJOS)
                if not asturias:
                    continue
                cpvs = texts(cfs, "ItemClassificationCode")
                t = norm(titulo + " " + txt(first(entry, "summary")))
                if not (any(c.startswith(CPV_OK) for c in cpvs) or any(k in t for k in KW)):
                    continue
                plazo = txt(first(first(cfs, "TenderSubmissionDeadlinePeriod"), "EndDate"))
                if plazo and plazo < hoy.isoformat():
                    continue
                importe = num(txt(first(cfs, "TaxExclusiveAmount"))) or num(
                    txt(first(cfs, "EstimatedOverallContractAmount"))) or num(txt(first(cfs, "TotalAmount")))
                vistos.add(ident)
                items.append({"titulo": titulo, "organismo": org, "lugar": ", ".join(dict.fromkeys(lugares)),
                              "importe": importe, "plazo": plazo, "enlace": enlace, "cpv": cpvs[:3],
                              "estado": estado, "publicado": upd})
            nxt = [l.get("href") for l in root if ln(l.tag) == "link" and l.get("rel") == "next"]
            url = nxt[0] if nxt and not viejo else None
        print(feed, "páginas:", pages, file=sys.stderr)
    items.sort(key=lambda x: x["plazo"] or "9999")
    out = {"actualizado": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z", "items": items}
    with open("licitaciones.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("Licitaciones:", len(items), file=sys.stderr)


if __name__ == "__main__":
    main()
