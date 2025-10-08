

type UiLanguage = 'sr' | 'en';

type MovementSection = {
  heading: string;
  paragraphs: string[];
};

type MovementTranslation = {
  badge: string;
  title: string;
  sections: MovementSection[];
};

const MOVEMENT_COPY: Record<UiLanguage, MovementTranslation> = {
  sr: {
    badge: 'PUMPAJ poruka',
    title: 'Pokret koji pojačava istinu',
    sections: [
      {
        heading: 'Šta je PUMPAJ?',
        paragraphs: [
          'PUMPAJ znači: pojačaj istinu i tempo. Ne staj. Drži ritam i budi uporan.',
          'To je naš kratki znak istrajnosti i borbe za bolju budućnost.',
        ],
      },
      {
        heading: 'Zašto protestujemo?',
        paragraphs: [
          'Novi Sad, 1. 11. 2024. – pad nadstrešnice na železničkoj stanici, gde je ubijeno 16 ljudi.',
          'Tražimo punu istinu i procesuiranje odgovornih za ovaj zločin.',
          'Korupcija i bezakonje – nameštanje poslova, katastrofalno izvođenje radova i zloupotrebe na svakom koraku.',
          'Tražimo pravnu državu u kojoj vlada zakon, a ne kriminal.',
        ],
      },
      {
        heading: 'Naš poziv',
        paragraphs: [
          'PUMPAJ = pravda, odgovornost i jednakost za sve.',
        ],
      },
    ],
  },
  en: {
    badge: 'PUMPAJ Message',
    title: 'A movement amplifying the truth',
    sections: [
      {
        heading: 'What is PUMPAJ?',
        paragraphs: [
          'PUMPAJ means: amplify the truth and the tempo. Don\'t stop. Keep the pace and stay persistent.',
          'It\'s our short call for perseverance and a better future.',
        ],
      },
      {
        heading: 'Why do we protest?',
        paragraphs: [
          'Novi Sad, Nov 1, 2024 – the collapse of the railway station canopy, where 16 people were killed.',
          'We demand the full truth and the prosecution of those responsible for this crime.',
          'Corruption and lawlessness – rigged contracts, disastrous workmanship, and abuses at every step.',
          'We demand a state governed by the rule of law, not by crime.',
        ],
      },
      {
        heading: 'Our call',
        paragraphs: [
          'PUMPAJ = justice, accountability, and equality for all.',
        ],
      },
    ],
  },
};

interface PumpajMessageProps {
  language: UiLanguage;
  className?: string;
}

export function PumpajMessage({ language, className = '' }: PumpajMessageProps) {
  const copy = MOVEMENT_COPY[language];

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="text-center">
        <style dangerouslySetInnerHTML={{
          __html: `
            @keyframes redPulse {
              0%, 100% {
                background-color: rgba(147, 51, 234, 0.3);
                border-color: rgba(168, 85, 247, 0.5);
                color: rgb(196, 181, 253);
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
              }
              50% {
                background-color: rgba(220, 38, 38, 0.4);
                border-color: rgba(248, 113, 113, 0.7);
                color: rgb(254, 202, 202);
                box-shadow: 0 25px 50px -12px rgba(220, 38, 38, 0.4), 0 0 30px rgba(248, 113, 113, 0.6), 0 0 60px rgba(248, 113, 113, 0.3);
              }
            }
            .red-pulse {
              animation: redPulse 2s ease-in-out infinite;
            }
          `
        }} />
        
        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide border red-pulse">
          {copy.badge}
        </span>
        <h3 className="mt-3 text-xl font-bold text-white">{copy.title}</h3>
      </div>

      <div className="space-y-4 text-white/90 leading-relaxed text-base">
        {copy.sections.map((section) => (
          <div key={section.heading} className="space-y-3">
            <h4 className="text-base font-bold text-red-300 border-b border-red-500/30 pb-1">
              {section.heading}
            </h4>
            {section.paragraphs.map((paragraph, index) => (
              <p key={`${section.heading}-${index}`} className="text-sm leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}