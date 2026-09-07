import type { Metadata } from 'next'
import './globals.css'
import { GoogleAnalytics } from '@/components/google-analytics'

export const metadata: Metadata = {
  title: 'Monitor de Concursos CGE',
  description: 'Alertas automáticas de concursos docentes — Consejo General de Educación Entre Ríos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  )
}
