export function checkoutUrl(): string {
  const base = process.env.NEXT_PUBLIC_PLATA_URL ?? "https://plata.puntoindigo.com"
  const returnPath = encodeURIComponent(process.env.APP_URL ?? "https://concursos-cge.puntoindigo.com")
  return `${base}/checkout?product=concursos-cge-pro&redirect=${returnPath}`
}
