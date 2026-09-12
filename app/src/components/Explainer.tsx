"use client";

import { useState } from "react";

export interface QA {
  q: string;
  a: string;
}

/** Plain-language answers; each one is something a real person asked. */
export const FAQ: { group: string; items: QA[] }[] = [
  {
    group: "Temel",
    items: [
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

Klasik borç verme platformlarında fiyat belli bir seviyenin altına inince teminatın otomatik satılır. Burada fiyatı okuyan bir mekanizma bile yok, dolayısıyla satacak bir şey de yok.`,
      },
      {
        q: "Teminat oranı (LTV) ne demek?",
        a: `Kilitlediğin teminatın değerinin yüzde kaçı kadar borç alabildiğin.

%35 teminat oranı: 100 dolarlık token kilitler, 35 dolar alırsın. Aradaki 65 dolar senin tamponun.

Oran düşükse, parayı veren o token'a az güveniyor demektir. Oynak ve riskli gördüğü token'a az verir, sağlam gördüğüne çok.`,
      },
      {
        q: "Hangi ağda çalışıyor, gerçek para mı?",
        a: `Üst çubuktaki rozet söyler. "Devnet · test" yazıyorsa test ağındasın: token'lar kurgusal, para gerçek değil, her şeyi bedavaya deneyebilirsin.

Mainnet'te rozet kırmızı olur ve her işlem gerçek paradır.`,
      },
    ],
  },
  {
    group: "Borç alanlar için",
    items: [
      {
        q: "Borcumu ödememek serbest mi?",
        a: `Evet, ve bazen mantıklıdır.

Vade dolduğunda token'ının değeri borcundan düşükse ödememek daha kârlıdır. Token gider, para sende kalır. Bu bir ceza değil, anlaşmanın parçası.

Parayı veren bu riski baştan biliyor ve faizi ona göre belirliyor.`,
      },
      {
        q: "Vadeyi kaçırırsam ne olur?",
        a: `Teminatının tamamı parayı verene geçer — token'ın o an ne kadar değerli olduğuna bakılmaksızın.

Token'ın borcundan çok daha değerliyse bile, vadeyi kaçırırsan hepsini kaybedersin. Aradaki fark sana iade edilmez.

Bu yüzden vadeyi takvimine yaz. Panelinde geri sayım var.`,
      },
      {
        q: "Erken ödersem daha az faiz öder miyim?",
        a: `Hayır. Faiz vade için baştan sabitlenir; bir gün sonra ödesen de aynı tutarı ödersin.

Bu bilinçli bir tercih: parayı veren getirisini bilerek kilitliyor. Kısa süreliğine nakit lazımsa kısa vadeli bir teklif seç.`,
      },
      {
        q: "Bir tekliften kısmen çekebilir miyim?",
        a: `Evet. Her teklifin bir "en az çekim" tutarı vardır; onun üstünde istediğin kadar çekersin, teminat oranlı hesaplanır.

Oranlı hesap hep yukarı yuvarlanır — küçük parçalara bölerek daha az teminat yatırmak mümkün değil.`,
      },
    ],
  },
  {
    group: "Borç verenler için",
    items: [
      {
        q: "Teklif açınca param nerede duruyor?",
        a: `Programın kasasında — sadece programın imzalayabildiği bir hesapta. Ne biz ne başkası oradan para çekemez.

Biri çekene kadar orada bekler. İstediğin an iptal edersin; çekilmemiş kısım anında döner.`,
      },
      {
        q: "Borçlu ödemezse ne alırım?",
        a: `Teminat token'ının kendisini, küçük bir protokol payı düşülmüş olarak. Nakit değil.

O token'ı satmak senin işin; zararına satman mümkün. Bu yüzden riskli gördüğün token'a düşük LTV ve yüksek faiz istemelisin.`,
      },
      {
        q: "Aynı tekliften birden çok kişi çekebilir mi?",
        a: `Evet. Bir teklif birden fazla krediye bölünebilir; her biri kendi vadesiyle ayrı bir kredidir.

Panelinde her birini ayrı görürsün ve vadesi dolan her biri için ayrı ayrı teminata el koyabilirsin.`,
      },
      {
        q: "Şartları sonradan değiştirebilir miyim?",
        a: `Hayır. Yayınlanan teklif ne diyorsa odur; borçlular buna güvenerek çekiyor.

Değiştirmek istersen iptal edip yenisini açarsın. Zaten açılmış krediler eski şartlarıyla vadesine kadar sürer.`,
      },
    ],
  },
  {
    group: "Ücret ve güvenlik",
    items: [
      {
        q: "Ne kadara mal oluyor?",
        a: `Borç alan için iki kalem: faiz (parayı verene) ve açılış ücreti (protokole, faizin bir yüzdesi). Teklif kartındaki "Toplam maliyet" ikisinin toplamı.

Borç veren için: geri ödemede faizin küçük bir yüzdesi ve temerrütte teminatın çok küçük bir yüzdesi protokole gider. Güncel oranlar her sayfada "Ücretler" kutusunda, zincirden okunur.`,
      },
      {
        q: "Ücretler sonradan değişebilir mi?",
        a: `Yeni krediler için evet, ama sınırlı: tavanlar programın içinde sabittir (faizin en çok %30'u, teminatın en çok %1'i). Yönetici anahtarı ele geçse bile pozisyonlara el konulamaz.

Açılmış bir kredinin oranları kredi açılırken kaydedilir; sonradan değişmez. Her değişiklik zincirde bir olay olarak görünür.`,
      },
      {
        q: "Kod denetlendi mi?",
        a: `Bağımsız bir denetim firmasından geçmedi. Kaynak seviyesinde bir güvenlik incelemesi yapıldı, bulguların hepsi kapatıldı; el yazımı testler ve rastgele koşulu fuzz testleri var. Rapor sayfanın altındaki linkte.

Programı yükseltebilen anahtar ve yönetici anahtarı çoklu imzalı bir kasada. Yine de: kaybetmeyi göze alamadığın parayı kilitleme.`,
      },
      {
        q: "\"Dondurulabilir token\" uyarısı ne demek?",
        a: `Bazı token'ların ihraççısı, o token'ın herhangi bir hesabını dondurma yetkisini elinde tutar. Dondurursa kasadaki teminat da donar: ne geri ödeme ne el koyma çalışır.

Program bunu engelleyemez — engellese memecoin'lerin çoğu elenirdi. Onun yerine uyarıyı kartta gösteriyoruz; kararı sen ver.`,
      },
      {
        q: "Fiyatlar ve dolar değerleri nereden geliyor?",
        a: `Mainnet'te Jupiter'ın fiyat servisinden, dakikada bir; test ağında sabit referans fiyatlardan.

Sadece kıyas için: LTV ve "kaça düşerse ödememek mantıklı" hesapları. Zincirdeki program hiçbir fiyat okumaz; teklif kabul edildikten sonra bu sayıların hiçbir etkisi yoktur.`,
      },
    ],
  },
];

export function Explainer({ items, defaultOpen = 0 }: { items: QA[]; defaultOpen?: number | null }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  return (
    <div className="card divide-y divide-line">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left"
            >
              <span className="text-[13.5px] font-semibold">{item.q}</span>
              <span className={`shrink-0 text-base leading-none text-muted transition-transform ${isOpen ? "rotate-45 text-accent" : ""}`}>
                +
              </span>
            </button>
            {isOpen && <div className="whitespace-pre-line px-5 pb-4 text-[13px] leading-relaxed text-fg-2">{item.a}</div>}
          </div>
        );
      })}
    </div>
  );
}
