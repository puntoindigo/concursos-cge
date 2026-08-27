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

  // Pass search to WP for server-side pre-filtering (reduces data transferred).
  // We'll still apply a stricter client-side filter below to fix WP's broad full-body matching.
  if (opts.searchString?.trim()) params.set('search', opts.searchString.trim())

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
  if (opts.searchString?.trim()) {
    const term = removeAccents(opts.searchString.trim().toLowerCase())
    posts = posts.filter((p) => {
      const title = removeAccents(decodeHtml(p.title.rendered).toLowerCase())
      const excerpt = removeAccents(decodeHtml(p.excerpt.rendered).toLowerCase())
      return title.includes(term) || excerpt.includes(term)
    })
  }

  return { posts, total, totalPages }
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
