import { Link } from 'react-router-dom'
import storeImage from '../assets/optimized/Computer & Laptop Store.jpeg'
import homeImage from '../assets/optimized/home.jpeg'
import accessoriesImage from '../assets/optimized/Computer Accessories.jpeg'
import printerImage from '../assets/optimized/Printers & Office Equipment.jpeg'
import repairImage from '../assets/optimized/Repair & Technical Support.jpeg'
import Reveal from '../components/Reveal'

const products = [
  ['Desktop computers', 'For home, office and professional work.', '▣', storeImage],
  ['Laptops', 'Study, work and entertainment on the go.', '▤', homeImage],
  ['Computer accessories', 'Keyboards, mice, audio, webcams and more.', '⌨', accessoriesImage],
  ['Printers & scanners', 'Reliable printing for home and business.', '▥', printerImage],
  ['Components', 'RAM, SSDs, processors and compatible parts.', '◈', repairImage],
  ['Networking', 'Routers, Wi-Fi devices, cables and adapters.', '⌁', accessoriesImage],
]

const featured = [
  'Desktop Computer',
  'Business Laptop',
  'Student Laptop',
  'Gaming Accessories',
  'Wireless Keyboard & Mouse',
  'SSD Storage',
  'Computer Monitor',
  'Printer & Scanner',
]

export default function Products() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow light"><span /> What we stock</p>
          <h1>Technology for <em className="text-gradient block">what’s next.</em></h1>
          <p>Explore our product categories, then contact us for current availability and the best price.</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow"><span /> Browse the range</p>
            <h2>Find your <em className="text-gradient">fit.</em></h2>
            <p className="heading-note">Availability and specifications confirmed at purchase.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map(([title, text, icon, img], index) => (
              <Reveal key={title} delay={index * 70}><Link to="/contact" className="card product-card-animated group block h-full">
                <div className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--line)] h-48 mb-5">
                  <span className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white text-[var(--navy)] font-bold text-xs shadow-sm">{icon}</span>
                  <img loading="lazy" decoding="async" src={img} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-[var(--navy)]/5" />
                </div>
                <div className="card-body">
                  <h3 className="text-[18px] font-semibold mb-3">{title}</h3>
                  <p className="text-sm text-[var(--muted)] leading-relaxed">{text}</p>
                  <span className="mt-4 inline-block text-sm font-semibold text-[var(--gold-dark)] flex items-center gap-1.5">Ask for today’s price <span>→</span></span>
                </div>
              </Link></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-[var(--cream)]">
        <div className="container">
          <div className="section-head center">
            <p className="eyebrow"><span /> Popular picks</p>
            <h2>Featured <em className="text-gradient">products.</em></h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-[var(--line)] border-l [border-color:var(--line)]">
            {featured.map((item, index) => (
              <Link key={item} to="/contact" className="flex flex-col gap-3 py-6 px-4 border-r border-b border-[var(--line)] hover:bg-white transition-colors group">
                <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--gold-dark)]">0{index + 1}</span>
                <strong className="text-sm">{item}</strong>
                <span className="text-[15px] text-[var(--gold-dark)] font-normal opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link className="btn btn-dark" to="/contact">Ask for today’s price <span>↗</span></Link>
          </div>
        </div>
      </section>
    </>
  )
}
