import Script from 'next/script'

interface GoogleAnalyticsProps {
  id?: string
}

export function GoogleAnalytics({ id }: GoogleAnalyticsProps) {
  const gaId = id ?? process.env.NEXT_PUBLIC_GA4_ID
  if (!gaId) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="puntoindigo-ga" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${gaId}');
      `}</Script>
    </>
  )
}
