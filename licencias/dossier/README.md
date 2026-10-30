# Dossier de licencias de Naolito

Este es el dossier que enviaremos a las agencias de licencias: presenta The Cute Side of Life y las ilustraciones propias de Naolito. «Villains Need Love» queda fuera a propósito.

| Archivo | Idioma |
|---|---|
| `naolito-licensing-dossier-en.html` / `.pdf` | Inglés |
| `naolito-dossier-licencias-es.html` / `.pdf` | Español |

Los HTML son autocontenidos: llevan las imágenes incrustadas y se pueden enviar como un solo archivo.

## Cómo regenerarlo

```
cd licencias/dossier/src
python build.py            # HTML + PDF (usa Chrome o Edge en modo headless)
python build.py --no-pdf   # solo HTML
```

- Los textos y las cifras están en `src/content_en.json` y `src/content_es.json`.
- El diseño de las páginas está en `src/template.html.j2` y `src/styles.css`.
- El arte está en `src/img/web/`, los logos en `src/img/logos/` y los fotogramas de *Homework* en `src/img/homework/`.
- Las imágenes «Product concept» aún no están generadas: `src/concepts.json` tiene el lote para Animanager (GPT Image 2.5, calidad high) y el hueco que ocupa cada una.
- Las tipografías Fredoka y Nunito están en `src/fonts/` y van incrustadas.
- El script indica las palabras por idioma (objetivo: unas 500, sin la página de fuentes) y lista los huecos `[COMPLETAR: …]` / `[TO COMPLETE: …]`, que deben ser 0.
- Cada PDF debe tener 11 páginas. Las páginas tienen altura fija: si un texto se alarga, se recorta sin añadir páginas, así que hay que revisarlas.

## Datos

Todas las cifras públicas se consultaron el 30/10/2026 y están en la página «Fuentes» de cada dossier. Las más de 50 tiendas, los libros con Lunwerg y los libros autopublicados son datos de Naolito del 30/10/2026.

Los datos de Meta Business Suite (alcance, interacción, edad, género, países y peso de Latinoamérica) no están en el dossier: no hubo sesión de Meta. La audiencia usa solo las cifras públicas de los perfiles.

## Notas de la investigación (no van en el dossier)

- **Incoherencias en naolito.com que conviene corregir:**
  - Homework aparece con «100+» y con «160» selecciones en festivales.
  - La preselección a los Goya figura como 2024 y como 2025.
  - La página del libro dice «Year: 2024», pero se publicó en 2021.
  - El comercio físico empieza en 2018 según /about y en marzo de 2017 según el antiguo /bio.
  - En el dossier solo usamos el premio verificado: la Biznaga de Plata del Festival de Málaga 2024.
- **Disney+:** /about lo describe como un acuerdo «for original animated content». La prensa (Canal Sur) habla de una licencia de cuatro años del corto Homework, y Naolito conserva la propiedad. El dossier usa la versión de la prensa.
- **Seguidores:**
  - La cifra de ≈1,2 M es la suma bruta de todas las redes, sin quitar duplicados.
  - La web dice «1.1M+» y en su portada da redondeos distintos: IG 500K, TikTok 250K y FB 350K.
- **Sin verificar, y por eso fuera del dossier:**
  - Tienda de Etsy «Naolitostore»: bloquea el acceso automático.
  - Society6: la página da 404.
  - Qwertee e INPRNT.
  - Que el libro esté en Fnac y El Corte Inglés.
  - Las ventas de los 7 puntos de venta antiguos: no sabemos cuáles siguen activos.
- **No hay cuentas propias de The Cute Side of Life:** es el lema de Naolito y forma parte de su logo.
- **Villains Need Love:** DesignPlace vende también productos de esta serie. El dossier solo cita sus líneas originales.
