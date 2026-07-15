# NextGenPlayz — Site Kaynak Kodu

Astro + React (islands) + Tailwind CSS v4 + Motion ile yeniden inşa edilmiş proje.

## Yerel geliştirme

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # dist/ klasörüne statik çıktı üretir
npm run preview   # build çıktısını yerelde önizler
```

**Node sürümü**: Astro 7, Node **22.12.0 veya üzeri** istiyor. `.nvmrc`
eklendi — `nvm` kullanıyorsan proje klasöründe `nvm use` yazman yeterli.

## VS Code'da çalıştırma

1. Bu klasörü VS Code'da aç (File → Open Folder). Sağ altta "Bu
   çalışma alanı için önerilen uzantılar var" bildirimi çıkacak —
   **Install All**'a bas (Astro + Tailwind CSS IntelliSense; Astro
   uzantısı olmadan `.astro` dosyaları düzgün renklenmez).
2. Terminal aç (Ctrl+`) ve `npm install` çalıştır — tek seferlik.
3. Siteyi açmak için iki yoldan biri:
   - Terminalden: `npm run dev`, sonra tarayıcıda
     `http://localhost:4321` aç.
   - **Ya da tek tuşla**: sol menüden "Run and Debug" → yeşil ok
     (veya doğrudan **F5**). Bu hem sunucuyu arka planda başlatır hem
     de siteyi otomatik Chrome'da açar; kapatmak için sunucuyu
     durdurmayı unutma (çöp kutusu ikonu, Terminal panelinde).
4. Kod değiştirdikçe tarayıcı otomatik yenilenir (hot reload) —
   sunucuyu yeniden başlatmana gerek yok.

`.vscode/` klasöründeki ayarlar sadece bu proje için geçerli, global VS
Code ayarlarını etkilemez.

## İçerik güncelleme

- **Portfolyo videoları**: `src/data/portfolio.ts` — `popularVideos`
  dizisindeki her obje bir video. Bu dosya artık tek doğru kaynak:
  `PortfolioGrid.tsx` (hem anasayfadaki "Most Popular Videos" bölümünde
  hem de `/portfolio` sayfasında) doğrudan buradan okuyor, yani burada
  yaptığın her değişiklik otomatik olarak sitenin her iki yerinde de
  görünür. Yeni bir video eklemek için aynı şekle sahip bir obje ekle
  (`id`, `title`, `platform`, `videoId`, `videoUrl`) — `videoId`,
  linkteki `v=` sonrası ya da `youtu.be/` sonrası kısım; kapak görseli
  YouTube'dan otomatik çekilir, ayrıca yüklemene gerek yok. Bir videoyu
  kaldırmak için objesini sil.
- **İstatistikler / donanım / servisler / site menüsü**: `src/lib/site.ts`
  — `navLinks` dizisi, Header/MobileNav/Footer'daki menünün tek kaynağı;
  buraya eklediğin bir link üçünde de otomatik görünür (karşılığı olan
  bir `id`'ye sahip bir `<section>` olduğu sürece).
- **Marka**: `public/logo.svg`, `public/favicon.svg` — kendi logonla değiştir.
- **OG/Twitter paylaşım görseli**: `public/og-image.jpg` hazır (site
  renkleriyle otomatik oluşturuldu). Tasarımı değiştirmek istersen
  `scripts/og-image-source.svg`'yi düzenleyip `npm run og:generate`
  çalıştır.
- **404 sayfası**: `src/pages/404.astro` — GitHub Pages eşleşmeyen her
  adres için bunu otomatik gösterir, ekstra bir ayar gerekmez.

## Canlı YouTube istatistikleri (opsiyonel)

`About.astro`, build zamanında `getChannelStats`'i zaten çağırıyor ve
sonucu `StatsBar`'a geçiriyor — tek eksik parça API anahtarı.
`src/lib/youtube.ts` içindeki talimatları izleyerek bir YouTube Data
API v3 anahtarı oluşturup GitHub repo secrets'ına `YOUTUBE_API_KEY`
olarak eklersen, `.github/workflows/deploy.yml` bunu otomatik olarak
build'e geçirir ve (aşağıdaki saatlik otomatik build sayesinde) "30
Million+ Views" gibi sabit metinlerin yerini gerçek, güncel sayılar
alır. Anahtar eklemezsen hiçbir şey bozulmaz — `src/lib/site.ts`
içindeki sabit metinler gösterilmeye devam eder.

## İletişim formu

https://formspree.io/f/xdkrrloe adresine bağlı ve çalışıyor — gönderilen
mesajlar Formspree hesabındaki ("NextGenPlayz Contact" projesi) e-posta
adresine düşer. Formu farklı bir Formspree formuna bağlamak istersen
`src/components/Contact.tsx` içindeki `FORMSPREE_ID` değerini değiştir.

## Gece/Gündüz modu

Sağ üstteki güneş/ay ikonuyla değiştiriliyor. Seçim `localStorage`'da
tutulur ve bir sonraki ziyarette hatırlanır; hiç seçim yapılmazsa site
tasarımın "imzası" olan koyu temada açılır (ziyaretçinin işletim sistemi
açık modda olsa bile). Renk paletleri `src/styles/global.css` içinde
`html[data-theme="light"]` altında — tüm bileşenler zaten CSS
değişkenleri kullandığı için yeni bir renk eklemek/değiştirmek tek
dosyadan yapılır. Açık mod metin renkleri WCAG AA kontrastına göre
hesaplandı (bkz. dosyadaki yorum).

## Otomatik "Son Video" rozeti

Ana sayfada, başlığın hemen üstünde kanaldan **gerçek zamanlı** en son
yüklenen videoyu gösteren bir rozet var (`src/lib/youtube.ts` →
`getLatestVideo`). Bu, API anahtarı GEREKTİRMEZ — YouTube'un herkese açık
RSS beslemesini build sırasında okur. `deploy.yml` zaten saatte bir
otomatik yeniden build aldığı için (bkz. cron: `"15 * * * *"`), yeni bir
video yüklediğinde rozet bir saat içinde kendiliğinden güncellenir;
hiçbir dosyayı elle değiştirmene gerek yok. Build sırasında YouTube'a
erişilemezse (ör. yerel ağ kısıtlıysa) rozet sessizce gizlenir, site
bozulmaz.

## Güvenlik notları

- **CSP** (`src/layouts/BaseLayout.astro`): GitHub Pages özel HTTP
  başlıklarına izin vermediği için `<meta http-equiv>` üzerinden bir
  Content-Security-Policy uygulanıyor. Bu, sitenin script/stil/görsel/
  iframe/form kaynaklarını yalnızca gerçekten kullanılanlarla sınırlar.
  **Bilinen sınır**: `frame-ancestors` (clickjacking koruması) ve
  `X-Frame-Options` tarayıcılar tarafından yalnızca gerçek bir HTTP
  başlığı olarak gönderildiğinde çalışır — `<meta>` ile ayarlanamaz. Bunu
  kapatmak istersen ileride siteyi Cloudflare gibi bir proxy'nin arkasına
  almak gerekir; GitHub Pages'te kalındığı sürece bu bir platform sınırı.
- **security.txt**: `/.well-known/security.txt` (RFC 9116) — birisi bir
  güvenlik açığı bulursa nereden ulaşacağını gösterir. İçindeki e-posta
  adresini ve `Expires` tarihini gerçek/güncel tut.
- **İletişim formu honeypot**: `Contact.tsx`'teki gizli `_gotcha` alanı,
  Formspree'nin tanıdığı standart spam-bot tuzağı — gerçek kullanıcılar
  hiç görmez, botlar genelde otomatik doldurur ve Formspree o gönderimi
  sessizce eler.
- **typescript sürümü**: `package.json`'da bilerek `^6.0.3`'te sabit
  tutuluyor. `^7.x`'e geçmeyi düşünürsen önce `@astrojs/check`'in o
  sürümü desteklediğini doğrula — desteklemiyorsa `npm ci` GitHub
  Actions'ta ERESOLVE hatasıyla anında kırılır (deploy hiç başlamaz).



1. Bu klasörü `contactnextgenplayz.github.io` reposuna push et.
2. Repo → Settings → Pages → Source: **GitHub Actions** seç.
3. `main` dalına her push otomatik build + deploy tetikler
   (`.github/workflows/deploy.yml`).

Özel domain (ör. nextgenplayz.com) bağlarsan: `public/CNAME` dosyası
oluşturup içine domaini yaz, ve `astro.config.mjs`'teki `site` değerini
güncelle.
