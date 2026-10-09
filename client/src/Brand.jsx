// "Built & developed by SP Tech" credit: a slim strip under the header and a footer card.
const PEOPLE = [
  { name: 'Sidh Jain', short: 'Sidh', display: '90671 27688', tel: '+919067127688' },
  { name: 'Pinkesh Valderia', short: 'Pinkesh', display: '96536 72196', tel: '+919653672196' },
];
// WhatsApp opens a chat with Sidh.
const WHATSAPP = `https://wa.me/919067127688?text=${encodeURIComponent('Hi Sidh, I saw the ICC Pickleball live draw by SP Tech and would like to know more.')}`;

function Wordmark({ small = false }) {
  return (
    <span className={`sp-mark${small ? ' sp-mark-small' : ''}`} aria-label="SP Tech">
      <svg className="sp-swoosh" viewBox="0 0 120 40" aria-hidden="true">
        <path d="M4 30 C 30 6, 80 -2, 116 10 C 80 4, 40 12, 14 34 Z" fill="url(#sp-g)" />
        <defs>
          <linearGradient id="sp-g" x1="0" x2="1">
            <stop offset="0" stopColor="#1f8fff" />
            <stop offset="1" stopColor="#6cc04a" />
          </linearGradient>
        </defs>
      </svg>
      <b>SP</b>
      <span>Tech</span>
    </span>
  );
}

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8Z" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
    <path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Zm0 23.6c-2 0-4-.55-5.7-1.6l-.4-.24-3.9 1 1-3.8-.26-.4A10.6 10.6 0 1 1 16 26.6Zm5.8-7.9c-.3-.16-1.9-.93-2.2-1-.3-.12-.5-.16-.7.16-.2.3-.8 1-1 1.2-.18.2-.36.23-.68.08-.3-.16-1.36-.5-2.6-1.6-.95-.85-1.6-1.9-1.8-2.2-.18-.32 0-.5.14-.65.14-.14.3-.36.47-.54.16-.18.2-.3.3-.52.1-.2.05-.38-.03-.54-.08-.16-.7-1.7-.97-2.3-.25-.6-.5-.52-.7-.53h-.6c-.2 0-.54.08-.82.38-.28.3-1.07 1.05-1.07 2.56s1.1 2.97 1.25 3.17c.16.2 2.15 3.3 5.2 4.6.73.32 1.3.5 1.74.65.73.23 1.4.2 1.92.12.59-.09 1.9-.78 2.15-1.53.27-.75.27-1.4.19-1.53-.08-.14-.28-.22-.6-.38Z" />
  </svg>
);

export function CreditStrip() {
  return (
    <div className="credit-strip">
      <span className="credit-label">Built &amp; developed by</span>
      <Wordmark small />
      <span className="credit-contacts">
        {PEOPLE.map(p => (
          <a key={p.tel} className="credit-chip" href={`tel:${p.tel}`}>
            <PhoneIcon /> {p.short}
          </a>
        ))}
      </span>
    </div>
  );
}

export function BrandFooter() {
  return (
    <footer className="brand-footer">
      <p className="brand-footer-kicker">Built &amp; developed by</p>
      <Wordmark />
      <p className="brand-tagline">Turning ideas into <em>experiences</em></p>
      <div className="brand-people">
        {PEOPLE.map(p => (
          <a key={p.tel} className="brand-person" href={`tel:${p.tel}`}>
            <span className="brand-person-name">{p.name}</span>
            <span className="brand-person-tel"><PhoneIcon /> {p.display}</span>
          </a>
        ))}
      </div>
      <a className="brand-whatsapp" href={WHATSAPP} target="_blank" rel="noopener noreferrer">
        <WhatsAppIcon />
        <span>For any inquiries, message us on WhatsApp</span>
        <span aria-hidden="true">→</span>
      </a>
    </footer>
  );
}
