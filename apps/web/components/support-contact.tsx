import { mailHref, supportContact, telHref, whatsappHref } from '../lib/support-contact';

/** Clickable phone, WhatsApp and e-mail links to SolarixPro; renders nothing when none is configured. */
export function SupportContactLinks({ className }: { className?: string }): React.JSX.Element | null {
  const { phone, whatsapp, email } = supportContact();
  if (!phone && !whatsapp && !email) return null;
  return (
    <span className={className}>
      {phone && <a href={telHref(phone)}>{phone}</a>}
      {phone && (whatsapp || email) && ' · '}
      {whatsapp && (
        <a href={whatsappHref(whatsapp)} target="_blank" rel="noreferrer">
          WhatsApp {whatsapp}
        </a>
      )}
      {whatsapp && email && ' · '}
      {email && <a href={mailHref(email)}>{email}</a>}
    </span>
  );
}

/** « contactez SolarixPro » followed by the clickable coordinates when configured. */
export function ContactDossipv({ children = 'contactez SolarixPro' }: { children?: string }): React.JSX.Element {
  const contact = supportContact();
  const has = contact.phone || contact.whatsapp || contact.email;
  return (
    <>
      {children}
      {has && (
        <>
          {' '}
          (<SupportContactLinks />)
        </>
      )}
    </>
  );
}
