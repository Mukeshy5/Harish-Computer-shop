import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

const links = [
  ['Home', '/'],
  ['About Us', '/about'],
  ['Products', '/products'],
  ['Services', '/services'],
  ['Gallery', '/gallery'],
  ['Shop Login', '/app/login'],
]

const Navbar = () => {
  const [open, setOpen] = useState(false)
  const toggle = useRef(null)
  const header = useRef(null)
  useEffect(() => {
    if (!open) return
    const closeOutside = event => {
      if (!header.current?.contains(event.target)) setOpen(false)
    }
    const closeWithEscape = event => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggle.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [open])
  return (
    <header className="navbar" ref={header}>
      <div className="container nav-inner">
        <Link to="/" className="brand" aria-label="Harish Computer Shop home">
          <strong className="brand-name">
            <span className="brand-letter">H</span><span>arish</span>{' '}
            <span className="brand-letter">C</span><span>omputer</span>
          </strong>
        </Link>
        <button
          ref={toggle}
          className="site-menu-toggle"
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="site-navigation"
          onClick={() => setOpen(value => !value)}
        >
          {open ? <X size={23} /> : <Menu size={23} />}
        </button>
        <nav id="site-navigation" className={`nav-links ${open ? 'is-open' : ''}`} aria-label="Main navigation">
          {links.map(([label, path]) => (
            <NavLink key={path} to={path} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>
              {label}
            </NavLink>
          ))}
          <NavLink to="/contact" className="nav-cta" onClick={() => setOpen(false)}>Contact Us</NavLink>
        </nav>
      </div>
    </header>
  )
}

export default Navbar
