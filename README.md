# NextGenPlayz

NextGenPlayz YouTube kanalının web sitesi. Astro 7 + React islands + Tailwind CSS v4 + Motion ile üretilen statik bir sitedir ve GitHub Actions ile GitHub Pages'e deploy edilir. **Hiçbir API anahtarı, secret veya ortam değişkeni gerekmez.**

## Yerel geliştirme

Node **22.19 veya üzeri** gerekir (bağımlılık ağacındaki `undici@8` bunu şart koşar); önerilen sürüm 24 LTS'tir (`.nvmrc` → `nvm use`).

```bash
npm ci            # bağımlılıkları package-lock.json'a göre kurar
npm run dev       # http://localhost:4321
npm run check     # Astro + TypeScript kontrolü
npm run build     # dist/ klasörüne statik çıktı
npm run preview   # build çıktısını yerelde önizler
```

VS Code kullanıyorsan önerilen uzantıları (Astro, Tailwind CSS IntelliSense) kur; **F5** dev sunucusunu başlatıp siteyi Chrome'da açar (`.vscode/`).

## İçerik güncelleme

- **Popüler videolar:** `src/data/portfolio.ts` — ana sayfadaki "Most Popular Videos" ve `/portfolio` buradan okur. `videoId`, video linkindeki `v=` ya da `youtu.be/` sonrasındaki kısımdır; kapak görseli YouTube'dan otomatik gelir.
- **Menü, istatistikler, platformlar, servisler, kanal bilgileri:** `src/lib/site.ts`.
- **Kanal logosu (header):** `public/channel-logo.jpg` — orijinal NextGenPlayz kanal logosu, doğrudan site dosyalarından gösterilir (internetten çekilmez). Logoyu değiştirirsen favicon ve uygulama ikonlarını (`favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) da aynı görselle güncelle.
- **Paylaşım görseli (OG):** `public/og-image.jpg`. Tasarımı değiştirmek için `scripts/og-image-source.svg` dosyasını düzenleyip `npm run og:generate` çalıştır.
- **404 sayfası:** `src/pages/404.astro` (GitHub Pages eşleşmeyen her adreste otomatik gösterir).

## YouTube verisi (API anahtarı yok)

Ana sayfadaki **Latest Videos** bölümü kanalın en yeni 6 yüklemesini, Hero'daki **Latest Video** kartı en yenisini gösterir. Video başlığı, bağlantısı (Shorts dahil), küçük resmi, yayın tarihi ve görüntülenme sayısı build sırasında, anahtar gerektirmeyen public kaynaklardan otomatik alınır (`src/lib/youtube.ts`):

1. **YouTube'un resmi kanal feed'i** (`/feeds/videos.xml?channel_id=…`): başlık, link, yayın/güncelleme tarihi, açıklama, görüntülenme.
2. **Yüklemeler playlist feed'i** (`/feeds/videos.xml?playlist_id=UU…`): aynı resmi feed servisinin ayrı uç noktası; ilki geçici olarak yanıt vermezse kullanılır. Her istek hata durumunda bir kez daha denenir.
3. **Canlı sitedeki `/latest-videos.json`**: her build bu dosyayı üretir. YouTube'a ulaşılamayan bir build'de son başarılı veri korunur; site boş ya da hatalı görünmez.
4. **Yerleşik yedek video**: yalnızca hiç ağ yokken yapılan ilk deploy için.

Küçük resim boyutları `i.ytimg.com` üzerinden anahtarsız kontrol edilir. Kullanılan kaynak build logunda görünür, örneğin `[youtube] Latest videos: 6 from "feed"`. Toplam izlenme ve abone sayıları (`src/lib/site.ts`) elle güncellenir; bunlar için anahtarsız, resmi ve kararlı bir kaynak yoktur.

Workflow siteyi **her saat** yeniden build eder. GitHub, public repolarda 60 gün aktivite olmayınca zamanlanmış workflow'ları kapatır; workflow içindeki **keepalive** job'ı bunu her gün API üzerinden önler (sahte commit atmaz). YouTube'un feed'leri **72 saatten uzun** süre okunamazsa site son geçerli veriyle yayında kalır, ancak workflow günde bir kez başarısız (kırmızı) görünür ve GitHub sana e-posta gönderir; Actions'taki Build logunda `[youtube]` satırına bak.

## Deploy (GitHub Pages)

1. Bu dosyaları `contactnextgenplayz.github.io` reposunun **root** dizinine yükle.
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. `main` dalına her push, saatlik zamanlama ve Actions sekmesindeki **Run workflow** butonu build + deploy tetikler (`.github/workflows/deploy.yml`). Secret tanımlamana gerek yoktur.

Özel domain (ör. nextgenplayz.com) bağlarsan `public/CNAME` dosyasına domaini yaz; `astro.config.mjs` içindeki `site` ve `src/lib/site.ts` içindeki `url` değerlerini güncelle.

## İletişim formu

Form https://formspree.io/f/xdkrrloe adresine gönderilir ("NextGenPlayz Contact" projesi). Form ID'si public bir tanımlayıcıdır, secret değildir. JavaScript yüklenmeden gönderilse bile form normal bir POST olarak Formspree'ye gider. Gizli `_gotcha` alanı spam botları için honeypot'tur. Farklı bir forma bağlamak için `src/components/Contact.tsx` içindeki `FORMSPREE_ID` değerini değiştir.

## Gece / gündüz modu ve renkler

Sağ üstteki güneş/ay ikonuyla değiştirilir. Seçim `localStorage`'da saklanır; seçim yoksa site koyu temayla açılır. Renkler `src/styles/global.css` içindeki tasarım token'larındadır (açık tema: `html[data-theme="light"]`). Marka kırmızısı `--color-signal` vurgu rengidir; dolu butonlar aynı tondaki `--color-cta` (+ `-hover`, `-active`) token'larını kullanır ve beyaz yazıyla her iki temada WCAG AA kontrastı sağlar.

## Güvenlik notları

- **CSP:** GitHub Pages özel HTTP başlığına izin vermediği için `src/layouts/BaseLayout.astro` içinde `<meta http-equiv>` ile uygulanır ve yalnızca sitenin gerçekten kullandığı kaynaklara izin verir. Platform sınırı: `frame-ancestors` (clickjacking koruması) meta etiketiyle çalışmaz, gerçek bir HTTP başlığı gerektirir.
- **security.txt:** `/.well-known/security.txt` (RFC 9116) ve eski konum `/security.txt`. Her build'de `src/lib/securityTxt.ts` tarafından üretilir; `Expires` tarihi otomatik olarak 180 gün ileri alınır.
- **Bağımlılıklar:** `npm audit` 1 Ekim 2026 itibarıyla temizdir (0 açık); yeni açıklar zamanla yayımlanabileceği için düzenli olarak `npm audit` çalıştır. TypeScript bilerek 6.x aralığında tutulur; 7.x'e geçmeden önce `@astrojs/check` uyumluluğunu doğrula, aksi hâlde `npm ci` Actions'ta ERESOLVE hatasıyla durur.
