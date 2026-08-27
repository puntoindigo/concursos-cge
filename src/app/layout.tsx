import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Monitor de Concursos CGE',
  description: 'Alertas automáticas de concursos docentes — Consejo General de Educación Entre Ríos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
