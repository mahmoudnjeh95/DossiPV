import { JARGON, JARGON_PATTERN } from '../lib/jargon';

/** Text where each electrical abbreviation (Ns, Np, Nc, Voc…) carries a plain-French tooltip. */
export function Jargon({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(JARGON_PATTERN);
  return (
    <>
      {parts.map((part, index) =>
        // split() with a capture group puts the matches at the odd positions.
        index % 2 === 1 && JARGON[part] ? (
          <abbr key={index} title={JARGON[part]} style={{ textDecorationStyle: 'dotted' }}>
            {part}
          </abbr>
        ) : (
          part
        ),
      )}
    </>
  );
}
