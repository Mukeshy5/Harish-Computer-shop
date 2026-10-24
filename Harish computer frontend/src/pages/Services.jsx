import { Link } from 'react-router-dom'
import repairImage from '../assets/Repair & Technical Support.jpeg'
import storeImage from '../assets/Computer & Laptop Store.jpeg'
import printerImage from '../assets/Printers & Office Equipment.jpeg'
import Reveal from '../components/Reveal'

const services = [
  ['01', 'Computer & Laptop Repair', 'Get assistance with common hardware and software issues. Diagnosis and repair depend on the device condition and issue.', repairImage],
  ['02', 'Operating System & Software Installation', 'Installation and configuration of compatible operating systems, drivers and licensed software.', storeImage],
  ['03', 'Computer Upgrades', 'Improve system performance with compatible RAM, SSD and other hardware upgrades.', storeImage],
  ['04', 'Printer Setup & Troubleshooting', 'Assistance with printer installation, drivers, connectivity and common printing problems.', printerImage],
  ['05', 'New Computer Setup', 'Get help selecting, assembling and configuring a computer for home, office or study.', storeImage],
  ['06', 'Technical Support', 'Practical guidance for common computer issues, device setup and basic troubleshooting.', repairImage],
]

export default function Services() {
  return (
    <>
      <section className="page-hero"><div className="container"><p className="eyebrow light"><span /> What we do</p><h1>Support for every<br /><em>next step.</em></h1><p>From setup to repair, we help keep your technology working for you.</p></div></section>
      <section className="section"><div className="container"><div className="section-heading"><div><p className="eyebrow"><span /> Our services</p><h2>More than<br /><em>just a shop.</em></h2></div><p className="heading-note">Service availability and charges are confirmed after diagnosis.</p></div><div className="service-list">{services.map(([number, title, text, image], index) => <Reveal key={title} delay={index * 60}><article className="service-row-animated"><span className="service-number service-icon">{number}</span><div><h3>{title}</h3><p>{text}</p></div><img className="service-thumb" src={image} alt="" /><Link to="/contact">Enquire <span>→</span></Link></article></Reveal>)}</div></div></section>
      <section className="cta-section"><div className="container cta-inner"><p className="eyebrow light"><span /> Need a hand?</p><h2>Let’s solve it<br /><em>together.</em></h2><p>Tell us what is going on and we will guide you on the next step.</p><Link to="/contact" className="button button-gold">Contact us <span>↗</span></Link></div></section>
    </>
  )
}
