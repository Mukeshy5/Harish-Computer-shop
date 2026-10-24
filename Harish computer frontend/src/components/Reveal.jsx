import { useEffect, useRef } from 'react'

export default function Reveal({ children, className = '', delay = 0 }) {
  const element = useRef(null)

  useEffect(() => {
    const node = element.current
    if (!node) return undefined

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        node.classList.add('is-visible')
        observer.unobserve(node)
      }
    }, { threshold: 0.12 })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return <div ref={element} className={`reveal ${className}`} style={{ '--reveal-delay': `${delay}ms` }}>{children}</div>
}
