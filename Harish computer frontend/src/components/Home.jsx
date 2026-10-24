import { Link } from 'react-router-dom'
import storeImage from '../assets/Computer & Laptop Store.jpeg'
import homeImage from '../assets/home.jpeg'
import accessoriesImage from '../assets/Computer Accessories.jpeg'
import printerImage from '../assets/Printers & Office Equipment.jpeg'
import repairImage from '../assets/Repair & Technical Support.jpeg'
import Reveal from './Reveal'
import { useEffect, useState } from 'react'

const categories = [
  ['01', 'Desktop Computers', 'Reliable setups for home, office and professional work.', storeImage],
  ['02', 'Laptops', 'Portable performance for study, work and everyday life.', homeImage],
  ['03', 'Computer Accessories', 'Keyboards, audio, webcams, cables and more.', accessoriesImage],
  ['04', 'Printers & Scanners', 'Printing solutions for home, school and business.', printerImage],
  ['05', 'Components', 'RAM, SSDs, processors and compatible parts.', repairImage],
  ['06', 'Networking & Connectivity', 'Routers, Wi-Fi devices and connectivity essentials.', accessoriesImage],
]

const services = [
  ['01', 'Computer & Laptop Repair', 'Hardware and software diagnosis with dependable support.', repairImage],
  ['02', 'Computer Upgrades', 'Improve speed and storage with compatible upgrades.', homeImage],
  ['03', 'New Computer Setup', 'Selection, assembly and configuration for your needs.', storeImage],
]

const HeroHeadline = () => {
  const headlineSequence = 'Smart tech.|Trusted service.'
  const [position, setPosition] = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const finished = position === headlineSequence.length
    const empty = position === 0
    const delay = finished ? 1800 : empty && deleting ? 450 : deleting ? 55 : 95
    const timer = window.setTimeout(() => {
      if (finished) {
        setDeleting(true)
      } else if (empty && deleting) {
        setDeleting(false)
      } else {
        setPosition((current) => current + (deleting ? -1 : 1))
      }
    }, delay)

    return () => window.clearTimeout(timer)
  }, [deleting, position])

  const visibleText = headlineSequence.slice(0, position)
  const [primaryText, accentText = ''] = visibleText.split('|')

  return (
    <h1 className="hero-typewriter" aria-live="polite" aria-label="Smart tech. Trusted service.">
      {primaryText}
      {visibleText.includes('|') && <><br /><em>{accentText}</em></>}
    </h1>
  )
}

const Home = () => {
  return (
    <>
      <section className="hero hero-animated">
        <div className="hero-light hero-light-one" /><div className="hero-light hero-light-two" />
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow light"><span /> Your trusted technology partner</p>
            <HeroHeadline />
            <p className="hero-text">The right computers, accessories and expert support to help you work, learn and live better.</p>
            <div className="button-row">
              <Link to="/products" className="button button-gold">Explore Products <span>↗</span></Link>
              <Link to="/contact" className="text-link light-link">Get the best price <span>→</span></Link>
            </div>
            <div className="hero-proof">
              <span>✓ Quality products</span>
              <span>✓ Friendly guidance</span>
            </div>
            <div className="hero-stats">
              <div><strong>10+</strong><span>Years of trust</span></div>
              <div><strong>500+</strong><span>Happy customers</span></div>
              <div><strong>100%</strong><span>Personal support</span></div>
            </div>
          </div>
          <div className="hero-visual hero-image-enter">
            <div className="image-frame"><img src={storeImage} alt="Harish Computer Shop showroom" /></div>
            <div className="hero-badge"><strong>01</strong><span>Everything<br />in one place</span></div>
            <div className="hero-image-note"><span className="hero-image-dot" /> Visit our showroom<br /><b>Find your perfect setup</b></div>
          </div>
        </div>
      </section>

      <section className="section intro-section">
        <div className="container intro-grid">
          <div>
            <p className="eyebrow"><span /> Welcome to Harish Computer Shop</p>
            <h2>Upgrade your<br /><em>digital world.</em></h2>
          </div>
          <div>
            <p className="lead">The right technology should make life simpler, not more complicated.</p>
            <p>Whether you need a laptop for college, a complete office setup, a gaming accessory or help with an old computer, we help you find the right fit for your needs and budget.</p>
            <Link to="/about" className="text-link dark-link">More about us <span>→</span></Link>
          </div>
        </div>
        <div className="container highlights">
          <span><b>01</b> Quality products</span>
          <span><b>02</b> Budget-friendly options</span>
          <span><b>03</b> Expert assistance</span>
          <span><b>04</b> After-sales support</span>
        </div>
      </section>

      <section className="section categories-section">
        <div className="container">
          <div className="section-heading">
            <div className="section-heading-copy"><p className="eyebrow"><span /> Explore our range</p><h2>Find your <em>perfect fit.</em></h2><p className="section-subtitle">Smart choices for work, study, entertainment and everything in between.</p></div>
            <Link to="/products" className="text-link dark-link">View all products <span>↗</span></Link>
          </div>
          <div className="category-grid">
            {categories.map(([number, title, text, image], index) => (
              <Reveal key={title} delay={index * 70}><Link to="/products" className="category-card" key={title}>
                <img src={image} alt="" />
                <div className="category-overlay" />
                <div className="category-content">
                  <div className="category-top"><span>{number}</span><b>↗</b></div>
                  <h3>{title}</h3><p>{text}</p>
                </div>
              </Link></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section home-services">
        <div className="container">
          <div className="section-heading services-heading"><div className="section-heading-copy"><p className="eyebrow services-eyebrow"><span /> More than products</p><h2 className="services-title">Help when you<br /><em>need it.</em></h2><p className="section-subtitle services-subtitle">From setup to support, we make technology easier at every step.</p></div><Link to="/services" className="text-link dark-link services-link">Explore all services <span>↗</span></Link></div>
          <div className="home-service-grid">
            {services.map(([number, title, text, image], index) => (
              <Reveal key={title} delay={index * 90}><Link to="/services" className="home-service-card service-motion" key={title}>
                <img src={image} alt="" /><div className="home-service-shade" />
                <div className="home-service-content"><span>{number}</span><h3>{title}</h3><p>{text}</p><b>→</b></div>
              </Link></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section process-section">
        <div className="container">
          <p className="eyebrow"><span /> Simple, personal, helpful</p><h2>Technology made <em>easy.</em></h2>
          <div className="process-grid">
            {[
              ['01', 'Tell us what you need', 'Share your requirement, usage and budget.'],
              ['02', 'Get suitable options', 'We help you compare what is available.'],
              ['03', 'Confirm the details', 'Check price, specifications and warranty.'],
              ['04', 'Get set up', 'Take it home or request available support.'],
            ].map(([number, title, text], index) => <Reveal key={number} delay={index * 70}><article className="process-item"><span>{number}</span><h3>{title}</h3><p>{text}</p></article></Reveal>)}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta-inner">
          <p className="eyebrow light"><span /> Let’s get you sorted</p>
          <h2>Looking for the right<br /><em>computer?</em></h2>
          <p>Tell us what you need. We’ll help you find the right technology for your world.</p>
          <div className="button-row justify-center"><Link to="/contact" className="button button-gold">Send an enquiry <span>↗</span></Link><a href="https://wa.me/917800662424" target="_blank" rel="noreferrer" className="text-link light-link">WhatsApp us <span>→</span></a></div>
        </div>
      </section>
    </>
  )
}

export default Home