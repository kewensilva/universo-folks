import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from '@/lib/session';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'], weight: ['500', '600', '700', '800'] });

export const metadata: Metadata = {
  title: { default: 'Universo Folks', template: '%s · Universo Folks' },
  description: 'Aprender um pouco todo dia: cada planeta é um tema, com lições de 3 a 5 minutos e prática de verdade.',
};
export const viewport: Viewport = { themeColor: '#03040f', colorScheme: 'dark' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} h-full`}>
      <body className="starfield min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
