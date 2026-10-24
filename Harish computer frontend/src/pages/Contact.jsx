import { useState } from 'react'

export default function Contact() {
  const [sent, setSent] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget
    setSent(false)

    const formData = new FormData(form)
    const message = [
      `Hello Harish Computer Shop,`,
      `Name: ${formData.get('name')}`,
      `Contact: ${formData.get('contact')}`,
      `Enquiry: ${formData.get('message')}`,
    ].join('\n')
    window.open(`https://wa.me/917800662424?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
    setSent(true)
    form.reset()
  }

  return (
    <>
      <section className="page-hero"><div className="container"><p className="eyebrow light"><span /> Get in touch</p><h1>Let’s talk<br /><em>technology.</em></h1><p>Ask about products, prices, repairs or anything else you need help with.</p></div></section>
      <section className="section"><div className="container contact-grid"><div><p className="eyebrow"><span /> Contact Harish Computer Shop</p><h2>We’re here<br />to <em>help.</em></h2><p className="lead">Visit the shop or send us a message. We will get back to you with suitable options and current availability.</p><div className="contact-details"><div><b>Shop address</b><p>Gauriganj Road, Musafirkhana, Amethi</p></div><div><b>Call us</b><p><a href="tel:+919120306465">9120306465</a></p></div><div><b>Business email</b><p><a href="mailto:hairshcomputer.k@gmail.com">hairshcomputer.k@gmail.com</a></p></div><div><b>WhatsApp</b><p><a href="https://wa.me/917800662424" target="_blank" rel="noreferrer">Message us directly</a></p></div></div></div><form className="contact-form" onSubmit={handleSubmit}><h3>Send an enquiry</h3><p>Your enquiry will open directly in WhatsApp.</p><label>Name<input required name="name" placeholder="Your name" /></label><label>Phone or email<input required name="contact" placeholder="How can we reach you?" /></label><label>How can we help?<textarea required name="message" rows="4" placeholder="Tell us about your requirement..." /></label><button className="button button-dark" type="submit">Send on WhatsApp ↗</button>{sent && <p className="form-success">WhatsApp is ready with your enquiry. Please send the message to the shop.</p>}</form></div></section>
      <section className="section categories-section"><div className="container contact-note"><p className="eyebrow"><span /> Quick contact</p><h2>Prefer a quick<br /><em>conversation?</em></h2><div className="button-row"><a href="tel:+919120306465" className="button button-dark">Call now <span>↗</span></a><a href="https://wa.me/917800662424" target="_blank" rel="noreferrer" className="button button-gold">WhatsApp us <span>↗</span></a></div></div></section>
    </>
  )
}
