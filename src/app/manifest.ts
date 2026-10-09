import type { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'foco. - Pomodoro e Produtividade',
    short_name: 'foco.',
    description: 'Estude com mais foco e sem distrações.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#e11d48',
    icons: [
      {
        src: '/icon.png',
        sizes: 'any',
        type: 'image/png',
      },
      // Fallbacks standard
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
