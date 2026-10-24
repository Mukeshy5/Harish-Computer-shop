import { Link } from "react-router-dom";
import DeveloperCredit from "./DeveloperCredit";

const copyrightYear = new Date().getFullYear();

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-contact-strip">
          <div>
            <span className="footer-strip-icon">↗</span>
            <div>
              <small>Ready to get started?</small>
              <strong>Let’s find the right solution.</strong>
            </div>
          </div>
          <Link to="/contact" className="button button-gold">
            Contact the shop <span>↗</span>
          </Link>
        </div>
        <div className="footer-grid">
          <div>
            <Link
              to="/"
              className="brand"
              aria-label="Harish Computer Shop home"
            >
              <strong className="brand-name">
                <span className="brand-letter">H</span>
                <span>arish</span> <span className="brand-letter">C</span>
                <span>omputer</span>
              </strong>
            </Link>
            <p className="footer-copy">
              Your destination for computer products, accessories and technical
              support.
            </p>
            <p className="footer-address">
              Gauriganj Road, Musafirkhana, Amethi
            </p>
            <div className="footer-promise">
              <span>✓</span> Honest advice. Reliable technology.
            </div>
          </div>
          <div>
            <h4>Explore</h4>
            <Link to="/">Home</Link>
            <Link to="/about">About us</Link>
            <Link to="/products">Products</Link>
            <Link to="/services">Services</Link>
            <Link to="/developer">Developer</Link>
          </div>
          <div>
            <h4>Connect</h4>
            <Link to="/contact">Contact us</Link>
            <a href="tel:+919120306465">9120306465</a>
            <a href="mailto:hairshcomputer.k@gmail.com">
              hairshcomputer.k@gmail.com
            </a>
            <a
              href="https://wa.me/917800662424"
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp us
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {copyrightYear} Harish Computer Shop. All rights reserved.
          </span>
          <span>
            <Link to="/privacy">Privacy</Link> &nbsp;·&nbsp;{" "}
            <Link to="/terms">Terms</Link>
          </span>
          <DeveloperCredit className="footer-credit" />
        </div>
      </div>
    </footer>
  );
};

export default Footer;
