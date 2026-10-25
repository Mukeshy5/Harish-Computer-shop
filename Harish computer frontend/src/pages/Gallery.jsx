import { Link } from 'react-router-dom'
import homeImage from '../assets/home.jpeg'
import storeImage from '../assets/Computer & Laptop Store.jpeg'
import accessoriesImage from '../assets/Computer Accessories.jpeg'
import printerImage from '../assets/Printers & Office Equipment.jpeg'
import repairImage from '../assets/Repair & Technical Support.jpeg'
import Reveal from '../components/Reveal'

const gallery = [
  ['Desktop computer setups', storeImage],
  ['Laptops for students & professionals', homeImage],
  ['Computer accessories', accessoriesImage],
  ['Printers & scanners', printerImage],
  ['Repair & technical support', repairImage],
  ['Custom PC builds', storeImage],
  ['Gaming accessories', accessoriesImage],
  ['Office computer solutions', homeImage],
  ['SSD & component upgrades', printerImage],
  ['Networking & Wi-Fi setup', accessoriesImage],
  ['Laptop repair services', repairImage],
  ['Customer workstations', homeImage],
]

export default function Gallery() {
  return (
    <>
      <section className="page-hero page-hero-dark">
        <div className="container">
          <p className="eyebrow light"><span /> Gallery</p>
          <h1>Our work, <em className="text-gradient block">your tech.</em></h1>
          <p>A glimpse of computers, laptops, accessories and service setups at Harish Computer Shop.</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="flex flex-wrap gap-2 mb-10">
            {['All', 'Desktops', 'Laptops', 'Accessories', 'Printers', 'Repair'].map((label) => (
              <button key={label} className="px-4 py-2 rounded-sm border border-[var(--line)] text-sm font-medium hover:border-[var(--gold)] hover:text-[var(--gold-dark)] transition-colors">
                {label}
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {gallery.map(([title, img], index) => (
              <Reveal key={title} delay={index * 55}><div className="card gallery-card-animated group overflow-hidden">
                <div className="relative h-48 overflow-hidden">
                  <img src={img} alt={title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-[var(--navy)]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white font-semibold">View {title}</span>
                  </div>
                </div>
                <div className="card-body pt-4">
                  <h3 className="text-[17px] font-semibold">{title}</h3>
                  <Link className="text-sm text-[var(--gold-dark)] font-semibold mt-2 inline-block" to="/contact">
                    Enquire <span>→</span>
                  </Link>
                </div>
              </div></Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
