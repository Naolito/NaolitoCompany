# Dossier de licencias de Naolito

Este es el dossier que enviaremos a las agencias de licencias: presenta The Cute Side of Life y las ilustraciones propias de Naolito. «Villains Need Love» queda fuera a propósito.

| Archivo | Idioma |
|---|---|
| `naolito-licensing-dossier-en.html` / `.pdf` | Inglés |

Solo hay versión en inglés. El HTML es autocontenido: lleva las imágenes incrustadas y se puede enviar como un solo archivo.

## Esta versión

Es la versión original de 12 páginas (mismo diseño, portada y orden de páginas) con el feedback de Nacho aplicado:

- **Disney+ en grande:** la portada anuncia que *Homework* está en Disney+, con su logo, y la página 01 le dedica una tarjeta con un fotograma del corto.
- **Marcas con logo:** Netflix, Amazon, PlayStation, Nestlé (Nesquik), Pilot, San Miguel y Peak, en una franja de logos en la página 01.
- **Tiendas y libros:** «50+ retail stores in Europe» y los libros (Lunwerg / Planeta y autopublicados) son las cifras destacadas de la página de trayectoria.
- **Sin modestia y con mucho menos texto:** unas 690 palabras sin la página de fuentes. El original tenía unas 1.940 contadas igual.
- **Sin huecos:** no queda ningún `[TO COMPLETE: …]`.
- **Imágenes de producto:** las 7 maquetas de Redbubble e iCanvas de la página de productos se han sustituido por 7 «Product concept» generadas con Animanager. Las fotos reales del libro y de las tazas de Nesquik siguen ahí, con «(photo)» en el pie.
- **Pie de página:** el pie y el número de página ya no se montan sobre el contenido.

## Cómo regenerarlo

```
cd licencias/dossier/src
python build.py            # HTML + PDF (usa Chrome o Edge en modo headless)
python build.py --no-pdf   # solo HTML
```

- Los textos y las cifras están en `src/content_en.json`.
- El diseño de las páginas está en `src/template.html.j2` y `src/styles.css`.
- El arte está en `src/img/web/`, los logos en `src/img/logos/`, los fotogramas de *Homework* en `src/img/homework/` y las imágenes de producto generadas en `src/img/concepts/`.
- `src/concepts.json` recoge cómo se generó cada imagen de producto (modelo, calidad, referencia y prompt) y qué hueco ocupa.
- El script indica las palabras sin la página de fuentes y lista los huecos `[TO COMPLETE: …]`, que deben ser 0.
- El PDF debe tener 12 páginas.

## Imágenes de producto

- Se generaron el 30/10/2026 con Animanager, con GPT Image 2.5 (Sunburst) en calidad high, a partir de una ilustración real de cada personaje.
- Están en el canvas «rewewrwerwerwer» de Naolito Team › Stores › Illustrations, en el generador «Dossier product concepts».
- Son conceptos, no productos existentes, y así lo dice su pie.

## Datos

- **Cifras públicas:** se consultaron el 30/10/2026 y están en la página «Sources» del dossier.
- **Datos de Naolito (30/10/2026):** las más de 50 tiendas en Europa, los libros con Lunwerg / Planeta y los libros autopublicados.
- **Audiencia de Instagram y Facebook:** sale de Meta Business Suite, consultado el 30/10/2026. Son datos demográficos de los seguidores del periodo que muestra Meta (30/09/2023 – 29/10/2026):

| | Instagram @naolito | Facebook Naolito |
|---|---|---|
| Seguidores | 483.850 | 363.989 |
| Mujeres | 68,9 % | 55,9 % |
| 25–44 años | 80,2 % | 85,7 % |
| Países principales | EE. UU. 14,7 %, Francia 6,1 %, España 6,1 %, Brasil 5,2 %, Italia 4,7 % | México 23,1 %, EE. UU. 6,7 %, Brasil 5 %, Colombia 4,9 %, Filipinas 3,8 % |

- **Latinoamérica:** el 40 % de Facebook suma los países latinoamericanos de su top 10: México, Brasil, Colombia, Argentina y Perú.
- **Europa:** el 24 % de Instagram suma Francia, España, Italia, Alemania y Reino Unido.
- **Portfolio de Meta:** Naolito y @naolito están en el portfolio «Nacho Diaz Arjona» (business_id 148810709968190). El portfolio «Naolito» (2259498111021270) solo tiene DailyTeller, Animanager y @animanager_.
- **Alcance e interacción: fuera del dossier.** Las cuentas apenas publican ahora y las cifras de Meta son flojas. En los últimos 28 días, Instagram tuvo 1.458 cuentas alcanzadas y Facebook, 452 visualizaciones. En 2026, Facebook lleva 10.700 visualizaciones.

## Quitado por no tener dato

- Tamaño del equipo.
- Ventas de 2025.
- Puntos de venta y cuentas mayoristas actuales.
- Mínimos concretos para la agencia: queda «Annual minimums agreed together».
- Estado de la guía de estilo.
- Lista de tiendas y títulos autopublicados: no se dan cifras de libros.

## Notas de la investigación (no van en el dossier)

- **Incoherencias en naolito.com que conviene corregir:**
  - *Homework* aparece con «100+» y con «160» selecciones en festivales.
  - La preselección a los Goya figura como 2024 y como 2025.
  - La página del libro dice «Year: 2024», pero se publicó en 2021.
  - En el dossier solo usamos el premio verificado: la Biznaga de Plata del Festival de Málaga 2024.
- **Disney+:** /about lo describe como un acuerdo «for original animated content». La prensa (Canal Sur) habla de una licencia de cuatro años del corto *Homework*, y Naolito conserva la propiedad. El dossier usa la versión de la prensa.
- **Seguidores:** la cifra de ≈1,2 M es la suma bruta de todas las redes, sin quitar duplicados.
- **No hay cuentas propias de The Cute Side of Life:** es el lema de Naolito y forma parte de su logo.
