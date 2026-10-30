# management.naolito.com

> **Estado:** todavía no está publicada. Base de datos, Access y service token ya existen; faltan los pasos de [Puesta en marcha](#puesta-en-marcha).

Seguimiento de las agencias de licencias de Naolito: totales, filtros, tabla, actividad, detalle de cada agencia, plantillas y una API para agentes.

- **Dirección:** https://management.naolito.com
- **Entrada:** Cloudflare Access, solo correos @naolito.com. Cada acción del historial guarda quién la hizo.
- **Infraestructura:** proyecto de Cloudflare Pages `naolito-management` y base de datos D1 `naolito-management`. No comparte nada con `naolitoweb`.

## Puesta en marcha

La publicación necesita la confirmación de Nacho. Hecho eso, en un proceso nuevo (para que reciba el `CLOUDFLARE_API_TOKEN` actual):

```bash
cd management && npm install
export CLOUDFLARE_ACCOUNT_ID=…     # el de la dirección de dash.cloudflare.com
npm run access:aud                 # carga ACCESS_AUD en el proyecto
npm run deploy                     # publica y conecta D1 y las variables de wrangler.toml
```

Después, en Pages › `naolito-management` › Custom domains, añade `management.naolito.com`, y prueba: una cuenta @naolito.com entra, otra no, y `GET /api/agent/queue` responde con el service token.

La base `naolito-management` ya tiene las tablas, las 20 agencias, el informe y una versión anterior de las dos plantillas, sin aprobar: no hay que volver a importarla. Las plantillas buenas las guarda `npm run agent save-templates`, también sin aprobar. La migración `0001_init.sql` ya consta como aplicada en `d1_migrations`.

## Cómo funciona

1. Alguien edita la plantilla de un idioma y pulsa «Aprobar». Si después se edita, vuelve a necesitar aprobación.
2. El equipo elige agencias y pulsa «Enviar»: quedan **En cola**. Solo se puede si la plantilla de su idioma está aprobada.
3. Un agente lee la cola, coge cada agencia, la envía y registra el resultado con el texto enviado y la prueba.
4. El equipo o el agente marcan las respuestas.

Estados: `nuevo` (Sin empezar), `cola` (En cola), `preparando`, `atencion` (Necesita a Nacho), `enviado`, `respondio`, `reunion`, `firmada`, `descartada`.

## API para agentes

Base: `https://management.naolito.com/api/agent`. Todas las llamadas llevan el service token de Cloudflare Access:

```bash
curl https://management.naolito.com/api/agent/queue \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "X-Agent-Name: Daniel Martin"
```

`X-Agent-Name` es opcional: es el nombre que sale en el historial («Agente · Daniel Martin»). Las escrituras envían JSON. Los errores responden `{ "error": "…" }`. El service token solo entra en esta API; una persona no puede usarla y un agente no puede usar la del equipo ni aprobar plantillas.

| Método y ruta | Qué hace |
| --- | --- |
| `GET /queue` | Agencias en `cola` y `preparando`. Con `ready: true` incluyen `subject`, `body` y `template_version` ya personalizados. Con `ready: false` su plantilla necesita aprobación: no las envíes. |
| `GET /templates` | Las dos plantillas, con `status` (`draft` o `approved`) y `version`. |
| `PUT /templates/:lang` | Guarda un borrador (`en` o `es`). Cuerpo: `{ subject, body }`, y `version` si quieres evitar pisar a otro. Si el texto cambia, necesita aprobación. Marcadores admitidos: `{{saludo}}` y `{{referencia}}`. |
| `GET /agencies` | Todas las agencias con su estado, para localizar a quién marcar una respuesta. |
| `POST /agencies/:id/claim` | Coge una agencia de la cola antes de enviar (`cola` → `preparando`) y devuelve su texto. Responde 409 si otro agente la cogió o su plantilla no está aprobada. **Sin este paso no se puede registrar el envío.** |
| `POST /agencies/:id/sends` | Registra el resultado. Ver abajo. |
| `POST /agencies/:id/reply` | Marca una respuesta. Cuerpo: `{ state, note? }`, con `state` entre `respondio`, `reunion`, `firmada` y `descartada`. Solo con agencias ya contactadas. Con `state: "atencion"` y `note` obligatoria, pasa a «Necesita a Nacho» una agencia en `enviado` o `respondio`. |

### Registrar un envío

Enviado (`preparando` → `enviado`):

```json
{
  "status": "enviado",
  "subject": "Asunto enviado de verdad",
  "body": "Texto enviado de verdad",
  "proof": "https://… o data:image/png;base64,…",
  "via": "form",
  "recipient": "https://ejemplo.com/contacto"
}
```

`subject`, `body` y `proof` son obligatorios. `proof` es una dirección, un identificador de mensaje o una captura PNG, JPEG o WebP en base64 de hasta 1,4 MB. `via` y `recipient` son opcionales: por defecto, los de la agencia.

No se ha podido enviar (`preparando` → `atencion`, le llega al equipo como «Necesita a Nacho»):

```json
{ "status": "atencion", "why": "El formulario pide un captcha" }
```

## El agente: Daniel Martin

`agent/` envía el primer contacto y lee las respuestas desde dmartin@naolito.com, sin navegador ni sesión de Gmail: SMTP y IMAP con `AGENT_EMAIL` y `AGENT_EMAIL_APP_PASSWORD`, y la API con `CF_ACCESS_CLIENT_ID` y `CF_ACCESS_CLIENT_SECRET`. El prompt de la tarea Recurrent está en [AGENTE.md](AGENTE.md).

```bash
npm run agent save-templates   # guarda seed/templates.json como borrador; no toca lo que alguien ya editó
npm run agent test-email we-love-licensing   # manda a dmartin@naolito.com, y a nadie más, el texto y el dossier
npm run agent send             # paso 2: emails de la cola y agencias que no se pueden enviar
npm run agent forms            # formularios que tocan ahora, con sus campos
npm run agent claim <id>       # coge una agencia de formulario y devuelve su texto
npm run agent sent <id> <prueba>
npm run agent stuck <id> <motivo>
npm run agent replies          # paso 4: lee la bandeja y marca las respuestas
npm run agent flag <id> <motivo>
```

- `agent/forms.json` guarda lo visto en cada formulario el 30/10/2026. Si una agencia tiene `blocked`, pasa directamente a «Necesita a Nacho» con ese motivo.
- Antes de enviar se comprueba el texto final: sin huecos, menos de 120 palabras y sin condiciones. Si falla, la agencia va a «Necesita a Nacho».
- Una agencia que se queda en `preparando` nunca se reenvía: la siguiente pasada la manda a «Necesita a Nacho». Una agencia con un envío registrado no puede volver a la cola.
- Un correo se marca como leído cuando ya está tratado. Si no se sabe de quién es, sigue sin leer y sale en cada informe. Por eso conviene no abrir esa bandeja a mano: un correo leído ya no se procesa.
- Las respuestas automáticas no cuentan. Un rebote, o una respuesta que pregunta quién escribe o pide hablar, pasa a «Necesita a Nacho». Ante la duda, avisa: la detección busca palabras como «call» o «hablar» y puede dar falsas alarmas.

## Desarrollo

```bash
npm install
npm test             # API y acceso, con la migración y los datos reales sobre SQLite
npm run db:migrate   # aplica migrations/ a la base remota
npm run db:seed      # importa licencias/agentes/agencias.json
npm run deploy       # genera los datos y publica public/ y functions/
```

Las órdenes remotas necesitan `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` en el entorno. Ninguna clave va al repositorio.

`npm run access:aud` copia `ACCESS_AUD` del entorno al proyecto de Pages como secreto. Hay que ejecutarlo una vez antes de la primera publicación, y otra si cambia la aplicación de Access. Sin él la web responde 403 a todo.

`npm run db:seed` se puede repetir: actualiza la investigación y no toca estados, vías, notas ni historial. Las plantillas solo se crean si no existen. El estado de cada envío vive en D1, no en `agencias.json`. `seed/agency-extras.json` guarda la vía, el saludo, la referencia y el idioma de cada agencia.

`functions/_middleware.js` verifica el JWT de Access en cada petición y rechaza las que no lo traen: así las direcciones `*.pages.dev`, que Access no cubre, tampoco dan acceso. `ACCESS_TEAM_DOMAIN` y la base de datos están en `wrangler.toml`; `ACCESS_AUD` no es confidencial, pero el panel de Cloudflare lo entrega por el botón de copiar y por eso vive en el entorno y en el proyecto, no en el repositorio.
