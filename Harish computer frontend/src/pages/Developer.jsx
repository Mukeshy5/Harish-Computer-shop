const services = [
  ['01', 'Website Development', 'Professional, modern and mobile-friendly websites for businesses, startups, schools, restaurants and organizations.', ['Business and corporate websites', 'Portfolio and personal websites', 'Landing pages and promotional websites', 'Responsive UI, contact forms and WhatsApp integration', 'SEO-friendly structure and performance optimization']],
  ['02', 'Full Stack Development', 'Complete web applications with functional frontends, secure backends, APIs and database integration.', ['React.js application development', 'Node.js and Express.js backends', 'MongoDB and REST API integration', 'Authentication and role-based access', 'Admin dashboards and application optimization']],
  ['03', 'Custom Software Development', 'Customized software solutions designed around your business workflow and requirements.', ['Billing and invoicing software', 'Inventory and stock management', 'Employee and customer management', 'Reporting and business analytics', 'Business automation tools']],
  ['04', 'App Development', 'Practical application solutions that turn your business ideas into useful digital products.', ['Custom business and service applications', 'Web applications and progressive web apps', 'API and database integration', 'Authentication and account management', 'Testing, performance improvement and maintenance']],
  ['05', 'Website Maintenance & Management', 'Ongoing support to keep your website secure, updated and running smoothly.', ['Content and image updates', 'Website redesign and improvements', 'Speed and mobile responsiveness fixes', 'Security, backup and deployment support', 'Error monitoring and troubleshooting']],
  ['06', 'Bug Fixing & Error Resolution', 'Technical troubleshooting for website, software and application issues.', ['React.js and JavaScript errors', 'Node.js, Express.js and MongoDB issues', 'API, login and authentication problems', 'Broken layouts and responsive design issues', 'Build, deployment and configuration errors']],
  ['07', 'Technical Support', 'Practical technical assistance for your website, software and development projects.', ['Hosting, deployment, domain and DNS support', 'Database and API troubleshooting', 'Email and website integration', 'Software updates and configuration', 'Technical consultation and ongoing support']],
  ['08', 'E-commerce Website Development', 'Professional online stores with a smooth shopping and management experience.', ['Product catalog and category management', 'Cart, checkout and payment integration', 'Order and customer management', 'Admin dashboard and inventory control', 'Responsive and SEO-friendly product pages']],
  ['09', 'Website Redesign & Optimization', 'A modern look, better user experience and stronger performance for your existing website.', ['Modern UI/UX improvements', 'Responsive mobile and tablet layouts', 'Navigation and accessibility improvements', 'Speed and SEO structure optimization', 'Conversion-focused landing pages']],
  ['10', 'Freelance Development & Agency Partnerships', 'Flexible project-based, white-label and long-term development collaboration.', ['Project-based development', 'White-label agency support', 'Existing project improvements', 'Long-term maintenance contracts', 'Dedicated bug fixing and technical assistance']],
]

const process = [
  ['01', 'Requirement Analysis', 'Understand your business goals, ideas, features and technical requirements.'],
  ['02', 'Planning & Design', 'Prepare the website structure, application workflow and user experience.'],
  ['03', 'Development', 'Build the frontend, backend, database and required functionality.'],
  ['04', 'Testing & Bug Fixing', 'Test the application, fix errors and check responsiveness and usability.'],
  ['05', 'Deployment', 'Deploy the completed project to the appropriate hosting environment.'],
  ['06', 'Maintenance & Support', 'Provide updates, troubleshooting, improvements and ongoing assistance.'],
]

const faqs = [
  ['Can you create a website from scratch?', 'Yes. I can help plan, design, develop, test and deploy a website based on your requirements.'],
  ['Can you fix errors in an existing website?', 'Yes. I can investigate bugs, resolve technical issues and improve existing website functionality.'],
  ['Do you provide website maintenance?', 'Yes. Maintenance and technical support can be arranged according to your project needs.'],
  ['Can you develop custom billing or inventory software?', 'Yes. Custom software can be developed for billing, inventory, staff management, reporting and other workflows.'],
  ['Do you work with agencies and international clients?', 'Yes. I am available for suitable freelance projects, agency collaborations and ongoing development support.'],
  ['How can I get a project quote?', 'Contact me by email or phone and share your requirements. Cost and timeline depend on features, complexity and scope.'],
]

export default function Developer() {
  return (
    <>
      <section className="developer-hero">
        <div className="container developer-hero-grid">
          <div className="developer-hero-copy">
            <p className="eyebrow light"><span /> Developer profile</p>
            <h1>Mr. Mukesh<br /><em>Yadav.</em></h1>
            <div className="developer-role-list" aria-label="Developer roles">
              <span>Full Stack Developer</span>
              <span>Software Developer</span>
              <span>Website &amp; App Developer</span>
            </div>
            <p className="developer-tagline">Turning Ideas into Powerful Digital Solutions</p>
            <p className="developer-intro">I build modern, responsive, secure and high-performance websites, apps and software for businesses, startups and individuals. Technical support is available from planning to deployment.</p>
            <div className="button-row developer-hero-actions"><a className="button button-gold" href="https://wa.me/918052344204?text=Hello%20Mukesh%2C%20I%20want%20to%20start%20a%20project." target="_blank" rel="noreferrer">Start on WhatsApp <span>↗</span></a><a className="button developer-email-button" href="mailto:my8052344204@gmail.com?subject=Project%20Enquiry">Email support <span>↗</span></a></div>
            <div className="developer-hero-meta"><span><b>01</b> Strategy</span><span><b>02</b> Build</span><span><b>03</b> Support</span></div>
          </div>
          <div className="developer-hero-card"><div className="developer-code-bar"><span /><span /><span /><b>project.js</b></div><span className="developer-card-number">10+</span><strong>Ways to build<br /><em>better.</em></strong><p>Websites, software, apps and reliable technical support tailored to your goals.</p><div className="developer-card-footer"><span>React</span><span>Node.js</span><span>MongoDB</span></div></div>
        </div>
      </section>

      <section className="section developer-about">
        <div className="container developer-two-col">
          <div><p className="eyebrow"><span /> About me</p><h2>Technology that<br /><em>moves business forward.</em></h2></div>
          <div><p className="lead">Welcome to my developer portfolio!</p><p>I specialize in professional websites, custom software, web applications and digital solutions that help businesses improve their online presence, streamline operations and grow faster.</p><p>My approach combines clean coding, modern technologies, responsive design, performance optimization and user-friendly functionality. Every business deserves reliable technology, a professional online presence and dependable technical support.</p></div>
        </div>
      </section>

      <section className="section developer-services">
        <div className="container"><div className="developer-section-heading"><div><p className="eyebrow"><span /> My services</p><h2>Solutions built<br /><em>around you.</em></h2></div><p>From the first idea to deployment and support, get one dependable development partner.</p></div>
          <div className="developer-service-grid">{services.map(([number, title, text, items]) => <article className="developer-service-card" key={title}><span className="developer-service-number">{number}</span><h3>{title}</h3><p>{text}</p><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></article>)}</div>
        </div>
      </section>

      <section className="section developer-skills"><div className="container developer-two-col"><div><p className="eyebrow"><span /> Technologies &amp; skills</p><h2>Modern tools.<br /><em>Practical results.</em></h2><p className="lead">The tools and skills listed here reflect the technologies used across real projects.</p></div><div className="skill-groups"><div><h3>Frontend Development</h3><p>HTML5 · CSS3 · JavaScript · React.js · Tailwind CSS · Responsive Web Design</p></div><div><h3>Backend Development</h3><p>Node.js · Express.js · REST APIs · Authentication and authorization</p></div><div><h3>Database</h3><p>MongoDB · Database integration and management</p></div><div><h3>Tools &amp; Deployment</h3><p>Git and GitHub · VS Code · Hosting and deployment · Debugging and optimization</p></div></div></div></section>

      <section className="section developer-process"><div className="container"><p className="eyebrow"><span /> My development process</p><h2>Clear steps.<br /><em>Strong outcomes.</em></h2><div className="developer-process-grid">{process.map(([number, title, text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

      <section className="section developer-fit"><div className="container developer-two-col"><div><p className="eyebrow"><span /> Why work with me?</p><h2>A partner for<br /><em>your next step.</em></h2></div><ul className="developer-check-list">{['Customized solutions for your business requirements', 'Responsive and user-friendly design', 'Clean, maintainable code and practical problem-solving', 'Clear communication throughout the project', 'Performance and functionality optimization', 'Flexible freelance collaboration and ongoing support'].map(item => <li key={item}>{item}</li>)}</ul></div></section>

      <section className="section developer-industries"><div className="container"><p className="eyebrow"><span /> Industries I can support</p><h2>Digital solutions for<br /><em>every kind of business.</em></h2><div className="industry-list">{['Small and medium-sized businesses', 'Schools and educational institutions', 'Coaching institutes', 'Restaurants and hospitality businesses', 'Retail shops and distributors', 'Startups and entrepreneurs', 'Healthcare and service organizations', 'Digital marketing and web development agencies'].map(item => <span key={item}>{item}</span>)}</div></div></section>

      <section className="section developer-faq"><div className="container"><p className="eyebrow"><span /> Frequently asked questions</p><h2>Questions, answered.</h2><div className="developer-faq-grid">{faqs.map(([question, answer]) => <article key={question}><h3>Q. {question}</h3><p>{answer}</p></article>)}</div></div></section>

      <section className="developer-cta"><div className="container developer-cta-inner"><p className="eyebrow light"><span /> Let&apos;s discuss your project</p><h2>Let&apos;s build something<br /><em>amazing together.</em></h2><p>Have a website idea, software requirement, app concept or technical problem?</p><div className="button-row justify-center"><a className="button button-gold" href="mailto:my8052344204@gmail.com">Get a free consultation <span>↗</span></a><a className="text-link light-link" href="tel:+918052344204">+91 8052344204 <span>→</span></a></div></div></section>
    </>
  )
}
