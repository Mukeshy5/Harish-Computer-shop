import { Link } from 'react-router-dom'
import storeImage from '../assets/Computer & Laptop Store.jpeg'
import repairImage from '../assets/Repair & Technical Support.jpeg'

export default function AboutUs() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow light"><span /> About Harish Computer Shop</p>
          <h1>Technology with a<br /><em>human touch.</em></h1>
          <p>Friendly advice, reliable products and support you can count on.</p>
        </div>
      </section>
      <section className="section">
        <div className="container split-grid about-story">
          <div><p className="eyebrow"><span /> Our story</p><h2>Making tech<br /><em>feel simple.</em></h2></div>
          <div><p className="lead">Harish Computer Shop is your local destination for computers, laptops, accessories and technical services.</p><p>We believe buying technology should be clear and comfortable. Our team takes time to understand how you work, study or create, then helps you choose an option that makes sense for your needs and budget.</p><Link to="/contact" className="button button-dark">Talk to our team <span>↗</span></Link></div>
        </div>
      </section>
      <section className="section categories-section">
        <div className="container split-grid">
          <img className="about-image" src={storeImage} alt="Harish Computer Shop showroom" />
          <div><p className="eyebrow"><span /> Why choose us</p><h2>Good advice.<br /><em>Better choices.</em></h2><ul className="check-list"><li>Personalised product guidance</li><li>Options for different budgets</li><li>Setup, upgrades and repair support</li><li>Clear prices and service terms</li></ul></div>
        </div>
      </section>
      <section className="section">
        <div className="container split-grid">
          <div><p className="eyebrow"><span /> Built for your world</p><h2>From first setup<br />to <em>future upgrades.</em></h2><p className="lead">Whether you are starting from scratch or improving an existing setup, we are here for the next step.</p><Link to="/products" className="text-link dark-link">Explore products <span>→</span></Link></div>
          <img className="about-image" src={repairImage} alt="Technician repairing a laptop" />
        </div>
      </section>
    </>
  )
}
