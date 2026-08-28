const WP_API_BASE = 'https://cge.entrerios.gov.ar/wp-json/wp/v2'

export interface WpPost {
  id: number
  date: string
  title: { rendered: string }
  link: string
  excerpt: { rendered: string }
  categories: number[]
}

export interface FetchOptions {
  categoryDepts: number[]
  categoryLevels: number[]
  searchString?: string
  after?: string        // ISO date — only posts newer than this
  perPage?: number
  page?: number
}

export interface FetchResult {
  posts: WpPost[]
  total: number
  totalPages: number
}

export async function fetchConcursos(opts: FetchOptions): Promise<FetchResult> {
  const allCats = [...opts.categoryDepts, ...opts.categoryLevels]
  if (!allCats.length) return { posts: [], total: 0, totalPages: 0 }

  const params = new URLSearchParams({
    categories: allCats.join(','),
    per_page: String(opts.perPage ?? 50),
    page: String(opts.page ?? 1),
    orderby: 'date',
    order: 'desc',
    _fields: 'id,date,title,link,excerpt,categories',
  })

  if (opts.after) params.set('after', opts.after)

  // Do NOT pass searchString to WP: WP search is not accent-insensitive and matches
  // full post body (too broad). All text filtering is done client-side below.

  const res = await fetch(`${WP_API_BASE}/posts?${params}`, {
    headers: { 'User-Agent': 'ConcursosCGEBot/1.0 (+https://puntoindigo.com)' },
    cache: 'no-store',
  })

  if (!res.ok) {
    if (res.status === 400) return { posts: [], total: 0, totalPages: 0 }
    throw new Error(`WP API ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`)
  }

  const total = parseInt(res.headers.get('X-WP-Total') ?? '0')
  const totalPages = parseInt(res.headers.get('X-WP-TotalPages') ?? '1')
  let posts: WpPost[] = await res.json()

  // ── Date filter (client-side safety net) ────────────────────────────────────
  // WP may silently ignore `after` when combined with `search`, so we enforce it ourselves.
  if (opts.after) {
    const afterDate = new Date(opts.after)
    posts = posts.filter((p) => new Date(p.date) > afterDate)
  }

  // ── Category AND filter (client-side) ───────────────────────────────────────
  // WP API `categories` is OR; we enforce AND: post must have ≥1 dept AND ≥1 level.
  if (opts.categoryDepts.length && opts.categoryLevels.length) {
    posts = posts.filter(
      (p) =>
        opts.categoryDepts.some((id) => p.categories.includes(id)) &&
        opts.categoryLevels.some((id) => p.categories.includes(id))
    )
  } else if (opts.categoryDepts.length) {
    posts = posts.filter((p) => opts.categoryDepts.some((id) => p.categories.includes(id)))
  } else if (opts.categoryLevels.length) {
    posts = posts.filter((p) => opts.categoryLevels.some((id) => p.categories.includes(id)))
  }

  // ── Search string filter (client-side) ───────────────────────────────────────
  // WP `search` matches against the full post body which users can't see.
  // We guarantee the term appears in the visible title OR excerpt only.
  // Tokenize by word so combined "educación física FISICA" doesn't become
  // an unsatisfiable literal phrase — each word must appear independently.
  if (opts.searchString?.trim()) {
    const tokens = removeAccents(opts.searchString.trim().toLowerCase())
      .split(/\s+/)
      .filter(Boolean)
    posts = posts.filter((p) => {
      const haystack =
        removeAccents(decodeHtml(p.title.rendered).toLowerCase()) +
        ' ' +
        removeAccents(decodeHtml(p.excerpt.rendered).toLowerCase())
      return tokens.every((tok) => haystack.includes(tok))
    })
  }

  // total = filtered count (not WP body-match total, which is misleading)
  return { posts, total: posts.length, totalPages }
}

/** Normalize accented characters so "física" matches "fisica". */
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
}
