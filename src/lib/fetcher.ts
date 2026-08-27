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
  after?: string
  perPage?: number
  page?: number
}

export interface FetchResult {
  posts: WpPost[]
  total: number
  totalPages: number
}

export async function fetchConcursos(opts: FetchOptions): Promise<FetchResult> {
  // Ask API for posts in any of the selected categories (OR behavior from WP side)
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

  // Client-side AND filter: post must belong to at least one dept AND at least one level
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

  return { posts, total, totalPages }
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
