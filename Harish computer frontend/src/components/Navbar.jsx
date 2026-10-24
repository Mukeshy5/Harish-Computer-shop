import { Link, NavLink } from 'react-router-dom'

const links = [
  ['Home', '/'],
  ['About Us', '/about'],
  ['Products', '/products'],
  ['Services', '/services'],
  ['Gallery', '/gallery'],
  ['Shop Login', '/app/login'],
]

const Navbar = () => {
  return (
    <header className="navbar">
      <div className="container nav-inner">
        <Link to="/" className="brand" aria-label="Harish Computer Shop home">
          <strong className="brand-name">
            <span className="brand-letter">H</span><span>arish</span>{' '}
            <span className="brand-letter">C</span><span>omputer</span>
          </strong>
        </Link>
        <nav className="nav-links" aria-label="Main navigation">
          {links.map(([label, path]) => (
            <NavLink key={path} to={path} className={({ isActive }) => isActive ? 'active' : ''}>
              {label}
            </NavLink>
          ))}
          <NavLink to="/contact" className="nav-cta">Contact Us</NavLink>
        </nav>
      </div>
    </header>
  )
}

export default Navbar
