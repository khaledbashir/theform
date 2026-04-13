import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ANC Forms — AI Form Builder",
  description: "Describe what you need. AI builds the form. Share it. Submissions flow straight into the ANC CRM.",
};

// Runs before React hydrates — sets the initial theme class from ?theme= param
// (iframe src can pin it), falling back to the parent's prefers-color-scheme.
const themeInitScript = `
(function(){
  try {
    var p = new URLSearchParams(location.search).get('theme');
    var saved = null;
    try { saved = localStorage.getItem('theme'); } catch(e) {}
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    // Priority: URL param > saved user choice > OS preference
    var dark = p ? p === 'dark' : (saved ? saved === 'dark' : prefersDark);
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch(e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.className} min-h-screen`}>
        <ThemeToggle />
        {children}
        <Script id="theme-sync" strategy="afterInteractive">{`
          (function(){
            var root = document.documentElement;
            var urlTheme = new URLSearchParams(location.search).get('theme');

            // Follow OS/parent changes only when ?theme= was not pinned.
            if (!urlTheme && window.matchMedia) {
              var mq = window.matchMedia('(prefers-color-scheme: dark)');
              var onChange = function(e){ root.classList.toggle('dark', e.matches); };
              mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
            }

            // Live theme switching from the parent frame (Twenty) via postMessage.
            // Parent can send: window.postMessage({ type: 'theme', value: 'dark' | 'light' }, '*')
            window.addEventListener('message', function(ev){
              var d = ev && ev.data;
              if (!d || d.type !== 'theme') return;
              if (d.value === 'dark') root.classList.add('dark');
              else if (d.value === 'light') root.classList.remove('dark');
            });
          })();
        `}</Script>
      </body>
    </html>
  );
}
