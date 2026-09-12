"use client";

import { useState } from "react";

const ITEMS = [
  {
    q: "Burada tam olarak ne oluyor?",
    a: `Elindeki bir token'ı satmadan nakit almanı sağlıyor.

Token'ını teminat olarak kilitliyorsun, karşılığında nakit (stablecoin) alıyorsun. Vade dolmadan borcunu ödersen token'ın geri geliyor. Ödemezsen token'ın parayı veren kişiye geçiyor, aldığın para sende kalıyor.

Yani pozisyonunu bozmadan nakde çıkıyorsun.`,
  },
  {
    q: "Fiyat düşerse teminatım satılır mı?",
    a: `Hayır. Bu protokolde likidasyon diye bir şey yok.

Token'ın vade boyunca %90 düşse bile kimse dokunamaz — ne parayı veren, ne protokol. Tek belirleyici şey zaman.

Klasik borç verme platformlarında (Aave, Kamino gibi) fiyat belli bir seviyenin altına inince teminatın otomatik satılır. Burada fiyatı okuyan bir mekanizma bile yok, dolayısıyla satacak bir şey de yok.`,
  },
  {
    q: "Teminat oranı (LTV) ne demek?",
    a: `Kilitlediğin teminatın değerinin yüzde kaçı kadar borç alabildiğin.

%35 teminat oranı: 100 dolarlık token kilitler, 35 dolar alırsın. Aradaki 65 dolar senin tamponun.

Oran düşükse, parayı veren o token'a az güveniyor demektir. Oynak ve riskli gördüğü token'a az verir, sağlam gördüğüne çok.`,
  },
  {
    q: "Borcumu ödememek serbest mi?",
    a: `Evet, ve bazen mantıklıdır.

Vade dolduğunda token'ının değeri borcundan düşükse ödememek daha kârlıdır. Token gider, para sende kalır. Bu bir ceza değil, anlaşmanın parçası.

Parayı veren bu riski baştan biliyor ve faizi ona göre belirliyor. Riskli token'a yüksek faiz istemesinin sebebi bu.`,
  },
  {
    q: "Vadeyi kaçırırsam ne olur?",
    a: `Teminatının tamamı parayı verene geçer — token'ın o an ne kadar değerli olduğuna bakılmaksızın.

Yani token'ın borcundan çok daha değerliyse bile, vadeyi kaçırırsan hepsini kaybedersin. Aradaki fark sana iade edilmez.

Bu yüzden vadeyi takvimine yaz. Panelinde geri sayım da var.`,
  },
  {
    q: "Ne kadara mal oluyor?",
    a: `İki kalem var ve ikisini de teklif kartında açıkça gösteriyoruz:

• Faiz — parayı verene gidiyor
• Açılış ücreti — protokole gidiyor, faizin bir yüzdesi

Kart üzerindeki "Toplam maliyet" satırı ikisinin toplamı. Sürpriz kesinti yok.`,
  },
];

export function Explainer() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="panel divide-y divide-edge">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="text-[15px] font-medium">{item.q}</span>
              <span
                className={`shrink-0 text-lg leading-none text-muted transition-transform ${
                  isOpen ? "rotate-45 text-accent" : ""
                }`}
              >
                +
              </span>
            </button>
            {isOpen && (
              <div className="whitespace-pre-line px-5 pb-5 text-sm leading-relaxed text-fg-2">
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
