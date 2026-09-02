# CLAUDE.md — concursos-cge

## Qué hace este proyecto

Monitor privado de concursos docentes del CGE (Consejo General de Educación) de Entre Ríos.
Scraper del sitio WordPress del CGE: filtra por departamento, nivel y disciplina, y envía alertas
por email cuando se publican concursos nuevos. Corré en `concursos-cge.puntoindigo.com`.

## Stack

Next.js · Drizzle ORM · Neon PostgreSQL (schema `concursos_cge`) · Tailwind CSS · nodemailer · node-cron

## Comandos útiles

```bash
npm run dev          # puerto 3010
npm run build        # build de producción
npm run db:push      # sincronizar schema con Neon
npm run db:studio    # explorar DB
npm run cron         # ejecutar el cron runner manualmente (tsx cron-runner.ts)
```

## Auth

Acceso vía `pi_session` cookie (accounts.puntoindigo.com, Google OAuth).
- Superadmin: `daeiman@gmail.com` (acceso siempre)
- Resto: deben estar en la tabla `allowedEmails` del schema `concursos_cge`

El acceso se puede otorgar de dos maneras:
1. **Invitación manual** (panel de invitaciones en el dashboard, solo superadmin)
2. **Pago via Plata** (webhook POST `/api/webhooks/plata` — ver sección Plata)

## Schema DB (Neon compartida del ecosistema)

```
concursos_cge.config         — configuración del cron (categorías CGE, email destino, etc.)
concursos_cge.state          — estado del último run del cron
concursos_cge.allowed_emails — lista de emails con acceso
concursos_cge.run_history    — historial de runs del cron
```

DB URL en `.env.local` (ecosistema compartido — ver memory `ecosystem-db-standard`).

## Integración con Plata

El proyecto está integrado con `plata.puntoindigo.com` para cobros de acceso.

**Producto en Plata:** `concursos-cge-pro` — USD 5 — acceso al Monitor CGE

**Flujo:**
1. Usuario sin acceso ve pantalla "Acceso no disponible" con botón "Obtener acceso — USD 5"
2. El botón redirige a `plata.puntoindigo.com/checkout?product=concursos-cge-pro&redirect=...`
3. Plata cobra y llama al webhook `POST /api/webhooks/plata` con `event: "payment.confirmed"`
4. El webhook inserta el email en `allowedEmails` con `invitedBy: "plata"`
5. En refund (`payment.refunded`), el webhook elimina el email

**Env var requerida:**
```
PLATA_INTERNAL_SECRET   # secret de la integración, seteado en Vercel
```

**Archivos clave:**
- `src/app/api/webhooks/plata/route.ts` — endpoint webhook
- `src/lib/plata.ts` — helper `checkoutUrl()`
- `src/app/page.tsx` — pantalla de login/acceso (incluye botón de compra)

## Variables de entorno

```
DATABASE_URL            # Neon PostgreSQL (ecosistema compartido)
PI_SESSION_SECRET       # compartido con accounts y todas las apps del ecosistema
APP_URL                 # https://concursos-cge.puntoindigo.com
SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS   # envío de emails
CRON_SECRET             # protege el endpoint GET /api/bot cuando lo llama Vercel Cron
PLATA_INTERNAL_SECRET   # valida webhooks entrantes de Plata
NEXT_PUBLIC_PLATA_URL   # opcional, default: https://plata.puntoindigo.com
```

## Deploy

Vercel — proyecto `daeiman0/concursos-cge`.

```bash
vercel --prod --cwd /home/diego/projects/concursos-cge --yes
```

Verificar antes:
- `vercel whoami` → `daeiman`
- `git log -1 --format="%ae"` → `daeiman@gmail.com`
- `git config user.email` → `daeiman@gmail.com` (configurado localmente en el repo)
