import { Header } from '../components/Header'
import { Hero } from '../components/Hero'
import { StillAlive } from '../components/StillAlive'
import '../styles/home.css'

export function HomePage() {
  return (
    <main className="page-shell">
      <Header />
      <Hero />
      <StillAlive />
    </main>
  )
}
