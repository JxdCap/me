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
      <footer className="page-footer">
        *This is my zine. I write about "shit" I care about.
      </footer>
    </main>
  )
}
