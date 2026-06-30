import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free EPG Sources - Nexlify",
  description: "Free EPG (Electronic Program Guide) sources for LEGAL use. Stay informed about incoming programs with our curated EPG feeds.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

interface EpgSource {
  country: string;
  code: string;
  size: string;
  url: string;
  txtUrl: string;
}

const EPG_SOURCES: EpgSource[] = [
  { country: "All Sources", code: "ALL_SOURCES", size: "183.69 MB", url: "https://xtream-masters.com/epg/ALL_SOURCES1.xml.gz", txtUrl: "https://xtream-masters.com/epg/ALL_SOURCES1.txt" },
  { country: "United Arab Emirates", code: "AE", size: "2.01 MB", url: "https://xtream-masters.com/epg/AE1.xml.gz", txtUrl: "https://xtream-masters.com/epg/AE1.txt" },
  { country: "Albania", code: "AL", size: "411.88 KB", url: "https://xtream-masters.com/epg/AL1.xml.gz", txtUrl: "https://xtream-masters.com/epg/AL1.txt" },
  { country: "Al Jazeera", code: "ALJAZEERA", size: "2.94 KB", url: "https://xtream-masters.com/epg/ALJAZEERA1.xml.gz", txtUrl: "https://xtream-masters.com/epg/ALJAZEERA1.txt" },
  { country: "Argentina", code: "AR", size: "208.93 KB", url: "https://xtream-masters.com/epg/AR1.xml.gz", txtUrl: "https://xtream-masters.com/epg/AR1.txt" },
  { country: "Australia", code: "AU", size: "3.97 MB", url: "https://xtream-masters.com/epg/AU1.xml.gz", txtUrl: "https://xtream-masters.com/epg/AU1.txt" },
  { country: "Austria", code: "AT", size: "456.23 KB", url: "https://xtream-masters.com/epg/AT1.xml.gz", txtUrl: "https://xtream-masters.com/epg/AT1.txt" },
  { country: "Belgium", code: "BE", size: "121.31 KB", url: "https://xtream-masters.com/epg/BE2.xml.gz", txtUrl: "https://xtream-masters.com/epg/BE2.txt" },
  { country: "Brazil", code: "BR", size: "994.12 KB", url: "https://xtream-masters.com/epg/BR1.xml.gz", txtUrl: "https://xtream-masters.com/epg/BR1.txt" },
  { country: "Bulgaria", code: "BG", size: "187.67 KB", url: "https://xtream-masters.com/epg/BG1.xml.gz", txtUrl: "https://xtream-masters.com/epg/BG1.txt" },
  { country: "Canada", code: "CA", size: "6.30 MB", url: "https://xtream-masters.com/epg/CA2.xml.gz", txtUrl: "https://xtream-masters.com/epg/CA2.txt" },
  { country: "Switzerland", code: "CH", size: "5.95 MB", url: "https://xtream-masters.com/epg/CH1.xml.gz", txtUrl: "https://xtream-masters.com/epg/CH1.txt" },
  { country: "Czech Republic", code: "CZ", size: "5.76 MB", url: "https://xtream-masters.com/epg/CZ1.xml.gz", txtUrl: "https://xtream-masters.com/epg/CZ1.txt" },
  { country: "Germany", code: "DE", size: "4.21 MB", url: "https://xtream-masters.com/epg/DE1.xml.gz", txtUrl: "https://xtream-masters.com/epg/DE1.txt" },
  { country: "Spain", code: "ES", size: "1.85 MB", url: "https://xtream-masters.com/epg/ES1.xml.gz", txtUrl: "https://xtream-masters.com/epg/ES1.txt" },
  { country: "France", code: "FR", size: "5.22 MB", url: "https://xtream-masters.com/epg/FR1.xml.gz", txtUrl: "https://xtream-masters.com/epg/FR1.txt" },
  { country: "United Kingdom", code: "UK", size: "2.74 MB", url: "https://xtream-masters.com/epg/UK1.xml.gz", txtUrl: "https://xtream-masters.com/epg/UK1.txt" },
  { country: "Greece", code: "GR", size: "1.52 MB", url: "https://xtream-masters.com/epg/GR1.xml.gz", txtUrl: "https://xtream-masters.com/epg/GR1.txt" },
  { country: "Hong Kong", code: "HK", size: "669.58 KB", url: "https://xtream-masters.com/epg/HK1.xml.gz", txtUrl: "https://xtream-masters.com/epg/HK1.txt" },
  { country: "Croatia", code: "HR", size: "1.89 MB", url: "https://xtream-masters.com/epg/HR1.xml.gz", txtUrl: "https://xtream-masters.com/epg/HR1.txt" },
  { country: "Hungary", code: "HU", size: "1.69 MB", url: "https://xtream-masters.com/epg/HU1.xml.gz", txtUrl: "https://xtream-masters.com/epg/HU1.txt" },
  { country: "India", code: "IN", size: "3.89 MB", url: "https://xtream-masters.com/epg/IN1.xml.gz", txtUrl: "https://xtream-masters.com/epg/IN1.txt" },
  { country: "Italy", code: "IT", size: "1.70 MB", url: "https://xtream-masters.com/epg/IT1.xml.gz", txtUrl: "https://xtream-masters.com/epg/IT1.txt" },
  { country: "Netherlands", code: "NL", size: "1.84 MB", url: "https://xtream-masters.com/epg/NL1.xml.gz", txtUrl: "https://xtream-masters.com/epg/NL1.txt" },
  { country: "Poland", code: "PL", size: "8.73 MB", url: "https://xtream-masters.com/epg/PL1.xml.gz", txtUrl: "https://xtream-masters.com/epg/PL1.txt" },
  { country: "Portugal", code: "PT", size: "1.51 MB", url: "https://xtream-masters.com/epg/PT1.xml.gz", txtUrl: "https://xtream-masters.com/epg/PT1.txt" },
  { country: "Romania", code: "RO", size: "11.72 MB", url: "https://xtream-masters.com/epg/RO1.xml.gz", txtUrl: "https://xtream-masters.com/epg/RO1.txt" },
  { country: "Serbia", code: "RS", size: "2.17 MB", url: "https://xtream-masters.com/epg/RS1.xml.gz", txtUrl: "https://xtream-masters.com/epg/RS1.txt" },
  { country: "Sweden", code: "SE", size: "1.38 MB", url: "https://xtream-masters.com/epg/SE1.xml.gz", txtUrl: "https://xtream-masters.com/epg/SE1.txt" },
  { country: "Turkey", code: "TR", size: "155.69 KB", url: "https://xtream-masters.com/epg/TR1.xml.gz", txtUrl: "https://xtream-masters.com/epg/TR1.txt" },
  { country: "United States", code: "US", size: "5.96 MB", url: "https://xtream-masters.com/epg/US2.xml.gz", txtUrl: "https://xtream-masters.com/epg/US2.txt" },
  { country: "United States - Locals", code: "US_LOCALS", size: "53.93 MB", url: "https://xtream-masters.com/epg/US_LOCALS1.xml.gz", txtUrl: "https://xtream-masters.com/epg/US_LOCALS1.txt" },
  { country: "United States - Sports", code: "US_SPORTS", size: "291.92 KB", url: "https://xtream-masters.com/epg/US_SPORTS1.xml.gz", txtUrl: "https://xtream-masters.com/epg/US_SPORTS1.txt" },
  { country: "BeIN Sports", code: "BEIN", size: "51.45 KB", url: "https://xtream-masters.com/epg/BEIN1.xml.gz", txtUrl: "https://xtream-masters.com/epg/BEIN1.txt" },
  { country: "Plex", code: "PLEX", size: "4.30 MB", url: "https://xtream-masters.com/epg/PLEX1.xml.gz", txtUrl: "https://xtream-masters.com/epg/PLEX1.txt" },
  { country: "Rakuten", code: "RAKUTEN", size: "8.98 MB", url: "https://xtream-masters.com/epg/RAKUTEN1.xml.gz", txtUrl: "https://xtream-masters.com/epg/RAKUTEN1.txt" },
  { country: "Portugal - MEO", code: "portugal_meo", size: "1.50 MB", url: "https://xtream-masters.com/epg/portugal_meo.pt.xml", txtUrl: "https://xtream-masters.com/epg/portugal_meo.pt.txt" },
  { country: "Portugal - NOS", code: "portugal_nostv", size: "5.69 MB", url: "https://xtream-masters.com/epg/portugal_nostv.pt.xml", txtUrl: "https://xtream-masters.com/epg/portugal_nostv.pt.txt" },
  { country: "India - Tata Play", code: "india_tataplay", size: "1.95 MB", url: "https://xtream-masters.com/epg/india_tataplay.xml.gz", txtUrl: "https://xtream-masters.com/epg/india_tataplay.txt" },
  { country: "India - Dish TV", code: "india_dishtv", size: "1.18 MB", url: "https://xtream-masters.com/epg/india_dishtv.in.xml", txtUrl: "https://xtream-masters.com/epg/india_dishtv.in.txt" },
  { country: "Germany - Magenta TV", code: "germany_magentatv", size: "10.93 MB", url: "https://xtream-masters.com/epg/germany_web.magentatv.de.xml", txtUrl: "https://xtream-masters.com/epg/germany_web.magentatv.de.txt" },
  { country: "Germany - Sky", code: "germany_sky", size: "835.83 KB", url: "https://xtream-masters.com/epg/germany_sky.de.xml", txtUrl: "https://xtream-masters.com/epg/germany_sky.de.txt" },
];

export default function EpgPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center text-white font-bold text-xl">
              NX
            </div>
            <h1 className="text-3xl font-bold">Nexlify EPG Sources</h1>
          </div>
          <p className="text-neutral-400 max-w-2xl mx-auto">
            Free EPG (Electronic Program Guide) sources for LEGAL use only. Stay informed about incoming programs with our curated EPG feeds. Updated daily.
          </p>
        </div>

        {/* Sources table */}
        <div className="bg-[#141414] rounded-2xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 sm:px-6 py-4 border-b border-white/5 text-sm font-semibold text-neutral-400 uppercase tracking-wider">
            <span>Country / Source</span>
            <span>Size</span>
            <span>Download</span>
          </div>
          {EPG_SOURCES.map((source) => (
            <div
              key={source.code}
              className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 sm:px-6 py-3 border-b border-white/5 items-center hover:bg-white/5 transition"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 text-xs font-bold text-neutral-400">
                  {source.code.slice(0, 2)}
                </span>
                <span className="text-sm text-white">{source.country}</span>
              </div>
              <span className="text-sm text-neutral-400">{source.size}</span>
              <div className="flex items-center gap-2">
                <a
                  href={source.txtUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg transition"
                >
                  TXT
                </a>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-purple-600/20 to-pink-600/20 hover:from-purple-600/30 hover:to-pink-600/30 text-purple-300 rounded-lg transition"
                >
                  XML
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="mt-8 bg-[#141414] rounded-xl border border-white/10 p-6">
          <h3 className="text-sm font-semibold text-white mb-2">Important Notice</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">
            These EPG sources are provided for LEGAL use only. We do not host, store, or distribute any media content. 
            Users are solely responsible for the legality of the sources they use. Any copyright or DMCA concerns must be directed to the originating content providers.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-neutral-600 mt-8">
          © {new Date().getFullYear()} Nexlify. All rights reserved.
        </p>
      </div>
    </div>
  );
}
