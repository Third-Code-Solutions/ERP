import { permanentRedirect } from 'next/navigation'

export default function LegacyPipelinePage() {
  permanentRedirect('/pipeline')
}
