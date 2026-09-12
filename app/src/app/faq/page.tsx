"use client";

import Link from "next/link";
import { Explainer, FAQ } from "@/components/Explainer";
import { Feature, FeeCard, Icon, PageHeader, SectionHeading } from "@/components/ui";

const REPO = "https://github.com/sfreud1/memebook";

function Steps({ title, tone, steps }: { title: string; tone: "accent" | "lock"; steps: [string, string][] }) {
  const badge = tone === "accent" ? "bg-accent-soft text-accent" : "bg-lock-soft text-lock";
  return (
    <div className="card p-5">
      <p className="eyebrow">{title}</p>
      <ol className="mt-4 space-y-4">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${badge}`}>
              {i + 1}
            </span>
            <div>
              <p className="text-[13.5px] font-semibold">{t}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function FaqPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Nasıl çalışır"
        lede="Beş dakikada anlaşılan, sürprizi olmayan bir anlaşma: bir token, bir tutar, bir vade. Gerisi burada."
      />

      <section>
        <SectionHeading title="Üç adımda" />
        <div className="grid gap-5 md:grid-cols-2">
          <Steps
            title="Borç alıyorsan"
            tone="accent"
            steps={[
              ["Bir teklif seç", "Teminat token'ını ve tutarı yaz; kartlar sana eline geçecek, geri ödeyeceğin ve kilitleyeceğin teminatı gösterir."],
              ["Teminatı kilitle, nakdi al", "Tek imza. Teminat programın kasasına, nakit cüzdanına geçer. Vade boyunca kimse teminata dokunamaz."],
              ["Vade dolmadan öde — ya da bırak", "Ödersen teminat aynı işlemde döner. Ödemezsen teminat teklif sahibine geçer, aldığın para sende kalır."],
            ]}
          />
          <Steps
            title="Borç veriyorsan"
            tone="lock"
            steps={[
              ["Şartları yaz", "Hangi token'a, ne kadar, hangi faizle, ne kadar süre. Riski bir kez, burada fiyatlıyorsun."],
              ["Para kasada bekler", "Yayınladığın anda kilitlenir; biri çekene kadar orada durur. İstediğin an iptal edip geri alırsın."],
              ["Faizle geri gelir — ya da teminat", "Borçlu öderse anapara + faiz cüzdanına. Ödemezse vade sonunda teminat token'ının kendisine el koyarsın."],
            ]}
          />
        </div>
      </section>

      <section>
        <SectionHeading title="Ücretler ve riskler" sub="Ne kesildiği zincirden okunur. Ne olabileceği de burada yazılı." />
        <div className="grid gap-5 md:grid-cols-2">
          <FeeCard />
          <div className="card p-5">
            <p className="eyebrow">Bilerek taşınan riskler</p>
            <ul className="mt-4 space-y-3.5">
              <Feature icon={Icon.lock} title="Vade kaçarsa fazlası iade edilmez">
                Teminat borçtan değerli olsa bile tamamı karşı tarafa geçer. Takvimine yaz; panelde geri sayım var.
              </Feature>
              <Feature icon={Icon.eyeOff} title="Fiyat yok, dolayısıyla koruma da yok">
                Kimse pozisyonu takip etmez. Borç veren için teminat vade boyunca değer kaybedebilir; faiz bunun bedelidir.
              </Feature>
              <Feature icon={Icon.shield} title="Dondurulabilir token'lar">
                İhraççısı dondurma yetkisini tutan token'larda kasa da donabilir. Kartta uyarı gösteririz; kararı sen verirsin.
              </Feature>
            </ul>
          </div>
        </div>
      </section>

      {FAQ.map((g, i) => (
        <section key={g.group}>
          <SectionHeading title={g.group} />
          <Explainer items={g.items} defaultOpen={i === 0 ? 0 : null} />
        </section>
      ))}

      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="h3">Kod açık, inceleme yayında.</p>
          <p className="mt-1 text-[12.5px] text-muted">
            Program, testler, fuzz ve güvenlik incelemesi aynı depoda. Program adresi sayfanın altında.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={REPO} target="_blank" rel="noreferrer" className="btn-secondary">
            Kaynak kodu ↗
          </a>
          <a href={`${REPO}/blob/main/docs/audit-2026-09-11.html`} target="_blank" rel="noreferrer" className="btn-secondary">
            Güvenlik incelemesi ↗
          </a>
          <Link href="/" className="btn-primary">
            Teklifleri gör {Icon.arrow}
          </Link>
        </div>
      </section>
    </div>
  );
}
