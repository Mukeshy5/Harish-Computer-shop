import { Link, Routes, Route, useLocation } from 'react-router-dom'
import { Management } from './management/Management'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './components/Home.jsx'
import AboutUs from './pages/AboutUs'
import Services from './pages/Services'
import Products from './pages/Products'
import Contact from './pages/Contact'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Terms from './pages/Terms'
import Gallery from './pages/Gallery'
import Developer from './pages/Developer'
import { useEffect, useState } from 'react'
import { Code2, MessageCircle, Phone } from 'lucide-react'

function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-orbit" aria-hidden="true">
        <span className="loading-orbit-ring loading-orbit-ring-one" />
        <span className="loading-orbit-ring loading-orbit-ring-two" />
        <div className="loading-mark"><span>H</span><span>C</span></div>
      </div>
      <div className="loading-wordmark"><b>H</b>arish <b>C</b>omputer</div>
      <p className="loading-tagline">Smart technology. Trusted service.</p>
      <div className="loading-status">
        <span className="loading-status-dot" />
        <span>Preparing your digital experience</span>
        <i aria-hidden="true"><em /><em /><em /></i>
      </div>
    </div>
  )
}

function QuickActions({ showTop }) {
  return (
    <aside className="quick-actions" aria-label="Quick contact actions">
      <a className="quick-action quick-whatsapp" href="https://wa.me/917800662424" target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp">
        <span aria-hidden="true"><MessageCircle size={17} /></span><strong>WhatsApp</strong>
      </a>
      <a className="quick-action quick-call" href="tel:+919120306465" aria-label="Call Harish Computer Shop">
        <span aria-hidden="true"><Phone size={16} /></span><strong>Call now</strong>
      </a>
      <Link className="quick-action quick-developer" to="/developer" aria-label="Open developer support">
        <span aria-hidden="true"><Code2 size={16} /></span><strong>Developer<br />support</strong>
      </Link>
      <button className={`back-to-top ${showTop ? 'visible' : ''}`} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">↑</button>
    </aside>
  )
}

function NotFound() {
  const canGoBack = window.history.length > 1

  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <div className="not-found-glow not-found-glow-one" />
      <div className="not-found-glow not-found-glow-two" />
      <div className="container not-found-inner">
        <div className="not-found-code" aria-hidden="true">
          <span>4</span>
          <span className="not-found-zero">0</span>
          <span>4</span>
        </div>
        <div className="not-found-copy">
          <p className="eyebrow light"><span /> Looks like a wrong turn</p>
          <h1 id="not-found-title">This page took a<br /><em>different route.</em></h1>
          <p>We couldn’t find the page you were looking for. Let’s get you back to the good stuff.</p>
          <div className="button-row">
            <Link className="button button-gold" to="/">Return home <span>↗</span></Link>
            {canGoBack && (
              <button className="not-found-back text-link light-link" type="button" onClick={() => window.history.back()}>
                Go back <span>←</span>
              </button>
            )}
          </div>
        </div>
        <div className="not-found-foot">
          <span>ERROR / 404</span>
          <span>HARISH COMPUTER SHOP</span>
        </div>
      </div>
    </section>
  )
}

function App() {
  const location = useLocation()
  const [showTop, setShowTop] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 700)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 500)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname, location.search])

  if (loading) return <LoadingScreen />
  if (location.pathname === '/app' || location.pathname.startsWith('/app/')) return <Routes><Route path="/app/*" element={<Management />} /></Routes>
  return (
    <div className="site-shell">
      <Navbar key={location.pathname} />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/services" element={<Services />} />
          <Route path="/products" element={<Products />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/developer" element={<Developer />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <QuickActions showTop={showTop} />
    </div>
  )
}

export default App
