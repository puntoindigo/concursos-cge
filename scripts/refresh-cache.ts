/**
 * Standalone script: fetches all posts from the WP API and writes them to the cached_posts table.
 * Run via: npx tsx scripts/refresh-cache.ts
 * Used by the GitHub Actions refresh-cache workflow (no Vercel 10s limit here).
 */
import { config } from 'dotenv'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../src/db/schema'
import { sql, eq } from 'drizzle-orm'

config({ path: '.env.local' })
config({ path: '.env' })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const WP_API_BASE = 'https://cge.entrerios.gov.ar/wp-json/wp/v2'
const TIMEOUT_MS = 90_000 // 90s — GitHub Actions has plenty of time

async function fetchPage(params: URLSearchParams, page: number) {
  params.set('page', String(page))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${WP_API_BASE}/posts?${params}`, {
      headers: { 'User-Agent': 'ConcursosCGEBot/1.0' },
      signal: controller.signal,
    })
    if (!res.ok) {
      console.warn(`WP API ${res.status} on page ${page}`)
      return null
    }
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') ?? '1')
    const posts = await res.json() as { id: number; date: string; title: { rendered: string }; link: string; excerpt: { rendered: string }; categories: number[] }[]
    return { posts, totalPages }
  } catch (e) {
    console.warn(`WP API network error on page ${page}:`, (e as Error).message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const client = postgres(DATABASE_URL!, { prepare: false })
  const db = drizzle(client, { schema })

  const [cfg] = await db.select().from(schema.config).limit(1)
  if (!cfg) {
    console.error('No config row found')
    await client.end()
    process.exit(1)
  }

  const depts = cfg.categoryDepts as number[]
  const levels = cfg.categoryLevels as number[]
  const allCats = [...depts, ...levels]

  const params = new URLSearchParams({
    categories: allCats.join(','),
    per_page: '100',
    page: '1',
    orderby: 'date',
    order: 'desc',
    _fields: 'id,date,title,link,excerpt,categories',
  })

  console.log('Fetching page 1...')
  const first = await fetchPage(params, 1)
  if (!first) {
    console.warn('WP API unreachable — updating lastRunAt to avoid repeated dispatches')
    const now = new Date()
    await db
      .insert(schema.state)
      .values({ id: 1, lastRunAt: now, lastFoundCount: 0 })
      .onConflictDoUpdate({ target: schema.state.id, set: { lastRunAt: now } })
    await client.end()
    process.exit(0)
  }

  const allPosts = [...first.posts]
  const maxPages = Math.min(first.totalPages, 10)
  console.log(`Total pages: ${first.totalPages}, fetching up to ${maxPages}`)

  for (let p = 2; p <= maxPages; p++) {
    console.log(`Fetching page ${p}...`)
    const page = await fetchPage(params, p)
    if (page) allPosts.push(...page.posts)
  }

  // AND-filter: must have >=1 dept AND >=1 level category
  const filtered = (depts.length && levels.length)
    ? allPosts.filter(p => depts.some(id => p.categories.includes(id)) && levels.some(id => p.categories.includes(id)))
    : allPosts

  console.log(`Posts after category filter: ${filtered.length}`)

  if (filtered.length > 0) {
    const now = new Date()
    await db
      .insert(schema.cachedPosts)
      .values(filtered.map(p => ({
        wpId: p.id,
        date: new Date(p.date),
        title: p.title.rendered,
        link: p.link,
        excerpt: p.excerpt.rendered,
        categories: p.categories,
        cachedAt: now,
      })))
      .onConflictDoUpdate({
        target: schema.cachedPosts.wpId,
        set: {
          date: sql`excluded.date`,
          title: sql`excluded.title`,
          link: sql`excluded.link`,
          excerpt: sql`excluded.excerpt`,
          categories: sql`excluded.categories`,
          cachedAt: sql`excluded.cached_at`,
        },
      })

    const newest = filtered[0]
    await db
      .insert(schema.state)
      .values({ id: 1, lastRunAt: now, lastPostDate: newest.date, lastPostId: newest.id, lastFoundCount: filtered.length })
      .onConflictDoUpdate({
        target: schema.state.id,
        set: { lastRunAt: now, lastPostDate: newest.date, lastPostId: newest.id, lastFoundCount: filtered.length },
      })

    console.log(`Done: cached ${filtered.length} posts, lastRunAt=${now.toISOString()}`)
  } else {
    // Still update lastRunAt so we don't keep retrying immediately
    const now = new Date()
    await db
      .insert(schema.state)
      .values({ id: 1, lastRunAt: now, lastFoundCount: 0 })
      .onConflictDoUpdate({
        target: schema.state.id,
        set: { lastRunAt: now, lastFoundCount: 0 },
      })
    console.log('Done: 0 posts found (WP API returned empty for these categories)')
  }

  await client.end()
}

main().catch((e) => {
  console.error('refresh-cache failed:', e)
  process.exit(1)
})
