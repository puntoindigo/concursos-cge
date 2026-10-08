# Estado real — concursos-cge

Relevamiento del 2026-10-08 (rama `main` @ `baabacd`, último commit 2026-09-10).

## Qué es
Monitor privado de concursos docentes del CGE Entre Ríos (Next.js 15, Drizzle, Neon, nodemailer). Lee la API WordPress del CGE, filtra por departamento/nivel/texto, cachea en DB y manda alertas por mail. Acceso por cookie `pi_session` (accounts.puntoindigo.com), allowlist en DB y cobro vía Plata (USD 5). Detalle en `CLAUDE.md`.

## Estado
- `npm ci` + `npx tsc --noEmit` + `npm run build`: OK. No hay scripts de `lint` ni `test` (cero tests).
- Único branch remoto: `main`. No hay ramas ni PRs sin mergear.
- Actividad: 27/08 → 10/09 (setup, auth, Plata, caché, GA4, status bar, auto-refresh). Sin commits desde el 10/09.
- Workflow `refresh-cache.yml` (solo `workflow_dispatch`): último run exitoso 2026-09-28, o sea que la app lo sigue disparando.

## Riesgos
### Correctitud / seguridad (a verificar contra producción)
1. **Middleware bloquea cron y webhook de Plata.** `src/middleware.ts` exige cookie `pi_session` en todo `/api/*` salvo `/api/posts` y `/api/post/`. Ni Vercel Cron (`GET /api/bot`, `vercel.json` `0 10 * * *`) ni el webhook `POST /api/webhooks/plata` mandan esa cookie → por código recibirían 401. Efecto probable: el cron diario no corre y los pagos de Plata no habilitan acceso. Hay que confirmarlo en logs de Vercel.
2. **Middleware solo mira que exista la cookie, no que sea válida.** `POST /api/bot` y `/api/config` no llaman a `getUser()`: cualquiera con una cookie `pi_session` falsa puede reconfigurar el monitor y disparar envíos de mail a un destinatario arbitrario (`emailTo`) usando el SMTP del proyecto. `GET /api/bot?action=verify-smtp` es público por la misma ruta.
3. `GET /api/bot` solo valida `CRON_SECRET` si la variable está seteada; si no, queda abierto.
4. `tls: { rejectUnauthorized: false }` en `src/lib/mailer.ts` (SMTP sin validar certificado).

### Scraper
- Depende de la API WP pública `cge.entrerios.gov.ar/wp-json/wp/v2/posts` y de IDs de categoría fijos (`src/lib/categories.ts`). Si el CGE cambia categorías o bloquea el User-Agent, falla en silencio (flag `wpApiDown` + banner; `400` se trata como vacío).
- Filtro AND de categorías, búsqueda y fechas se hacen del lado cliente sobre máx. 10 páginas × 100 posts.
- `bot.ts`: hay una condición redundante en el envío de mail (`forceEmailEvenIfEmpty` nunca tiene efecto porque exige `posts.length > 0`); y el mail se manda con todos los posts hallados, sin dedup contra los ya notificados (puede repetir concursos en cada corrida).

### Cron / refresh
- Dos mecanismos: Vercel Cron diario (ver riesgo 1) y refresh de caché por GitHub Actions disparado desde `/api/posts` con `GITHUB_PAT` si el caché tiene >30 min. Si el PAT vence, el caché deja de actualizarse sin aviso. `workflow_dispatch` no tiene `schedule`.
- `cron-runner.ts` / `node-cron` son para correr local; no se usan en Vercel.

### Dependencias (`npm audit`: 18 vulns, 9 high / 9 moderate, 0 critical)
- Directas: `nodemailer` ≤10.0.8 (high), `next` (moderate), `tailwindcss` 3.x (high, arrastra postcss/braces/micromatch/fast-glob/chokidar), `node-cron` 3.x (moderate, vía `uuid`), `drizzle-kit` 0.28 (moderate, vía esbuild).
- Transitivas altas: `sharp`, `source-map-js`, `postcss`.
- Arreglable sin romper: `npm audit fix`. El resto requiere majors (tailwind 4, node-cron 4, drizzle-kit) → decisión de Diego. No se tocó nada en este PR.

## Secretos
- `git ls-files` y todo el historial: sin archivos `.env*` ni claves commiteadas; grep de patrones (postgres://user:pass@, tokens `ghp_`, `AKIA`, `*_SECRET=`/`*_PASS=` literales) sin coincidencias. `.gitignore` cubre `.env*`.
- El workflow usa `secrets.DATABASE_URL` (correcto). Nada que rotar por commits.

## Necesita a Diego
1. Revisar logs de Vercel: ¿corrió el cron de las 10:00 UTC y llegaron webhooks de Plata? Si no, autorizar el fix de middleware (excluir `/api/bot` GET con `CRON_SECRET` y `/api/webhooks/plata`, y validar sesión real en `POST /api/bot` y `/api/config`).
2. Decidir si se actualizan dependencias con breaking changes (tailwind 4, node-cron 4, drizzle-kit) y aprobar `npm audit fix` + bump de `nodemailer`/`next`.
3. Confirmar que `GITHUB_PAT` en Vercel está vigente y que `CRON_SECRET` está seteado.
4. Decidir si el mail debe deduplicar concursos ya notificados.
