# The Inn

Arkadaş grupları için özel, self-hosted sesli ve yazılı sohbet uygulaması. Discord benzeri deneyimi tamamen kendi bilgisayarında çalıştırır; bulut yok, abonelik yok, üçüncü taraf yok. Sadece sen ve arkadaşların.

## Özellikler

- **Bas-Konuş Sesli Sohbet** — WebRTC peer-to-peer ses akışı, sustur/duymama kontrolleri ve kullanıcı bazlı konuşma göstergeleri
- **Yazılı Sohbet** — Gerçek zamanlı mesajlaşma, emoji reaksiyonları, yazıyor göstergesi ve mesaj geçmişi
- **Dosya ve Görsel Paylaşımı** — Sürükle-bırak veya yapıştır ile 25 MB'a kadar dosya; görseller satır içinde görünür ve lightbox önizleme açılır
- **Oda Sistemi** — Host oda oluşturabilir, silebilir, sıralayabilir; kullanıcılar odalar arasında serbestçe geçer
- **Davet Kodları** — Süresi ve kullanım limiti ayarlanabilen kriptografik olarak güvenli token yapısı
- **Ekran Paylaşımı** — Ekranı veya belirli bir pencereyi ses yakalama desteğiyle paylaşma
- **İnternet Tünelleme** — Uzak erişim için ngrok, Cloudflare Tunnel ve benzeri araçlarla yerleşik uyum
- **Sistem Tepsisi** — Tepsiye küçültme ve arka planda çalışmaya devam etme
- **Oturum Kalıcılığı** — Ağ kopmalarında otomatik yeniden bağlanma; uygulama yeniden açıldığında oturum devamı
- **Derin Bağlantılar** — `theinn://` protokolü ile tek tık davete katılım
- **Tekil Örnek Kilidi** — Uygulamanın aynı anda yanlışlıkla birden fazla kez açılmasını engeller

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Masaüstü Kabuğu | [Electron 40](https://www.electronjs.org/) + Electron Forge |
| Ön Yüz | [React 19](https://react.dev/) + TypeScript |
| Bundler | [Vite 5](https://vite.dev/) (main, preload, renderer için ayrı yapılandırma) |
| Arka Uç | [Express.js 5](https://expressjs.com/) + [Socket.IO 4](https://socket.io/) |
| Veritabanı | [SQLite](https://www.sqlite.org/) + [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) + Drizzle Kit migrasyonları |
| Ses/Video | STUN/TURN fallback destekli WebRTC (peer-to-peer) |
| Dosya Yükleme | [Multer](https://github.com/expressjs/multer) (disk storage, 25 MB limit) |
| Kurulum Paketi | Squirrel.Windows (otomatik güncelleme destekli) |

## Hızlı Başlangıç

### Gereksinimler

- [Node.js](https://nodejs.org/) >= 18
- npm (Node.js ile gelir)
- Windows 10/11 (ana hedef; Electron macOS/Linux destekler ancak installer tarafı Windows odaklıdır)

### Kurulum

```bash
git clone https://github.com/utkuvibing/adalet-discord-ozel.git
cd adalet-discord-ozel
npm install
```

`postinstall` betiği, Electron için native modülleri (`better-sqlite3`) otomatik olarak yeniden derler.

### Çalıştırma (Geliştirme)

```bash
npm start
```

Renderer süreci için Vite hot-reload ile Electron uygulamasını başlatır.

### Build

```bash
npm run make
```

Electron Forge + Squirrel ile Windows installer (`Setup.exe`) üretir.

### Sürüm (GitHub Otomatik)

Tag push sonrası installer dosyaları GitHub Releases'a otomatik build + publish edilir.

```bash
# 1) package.json sürümünü güncelle
git add package.json package-lock.json
git commit -m "release: vX.Y.Z"

# 2) tag oluştur ve gönder
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Workflow: `.github/workflows/release-windows.yml`

Kullanıcılar bir kez kurulum yaptıktan sonra uygulama açılışta (ve her 30 dakikada bir) `update-electron-app` ile güncellemeleri kontrol eder.

### Veritabanı

SQLite şeması Drizzle Kit ile yönetilir. Migrasyonlar açılışta otomatik çalışır; istersen manuel de çalıştırabilirsin:

```bash
npm run db:push       # Şemayı veritabanına uygula
npm run db:generate   # Migrasyon dosyaları üret
```

## Mimari

```
┌─────────────────────────────────────────────────────┐
│                    Electron Main                     │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │  IPC Bridge   │  │    Embedded Server          │   │
│  │  (preload.ts) │  │  ┌────────┐ ┌───────────┐  │   │
│  │               │  │  │Express │ │ Socket.IO │  │   │
│  │  PTT, tray,   │  │  │REST API│ │ signaling │  │   │
│  │  screen share │  │  └───┬────┘ └─────┬─────┘  │   │
│  └──────┬───────┘  │      │             │         │   │
│         │          │  ┌───┴─────────────┴───┐     │   │
│         │          │  │   SQLite (Drizzle)   │     │   │
│         │          │  └──────────────────────┘     │   │
│         │          └────────────────────────────┘   │
└─────────┼───────────────────────────────────────────┘
          │
┌─────────┴───────────────────────────────────────────┐
│                 Renderer (React + Vite)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │JoinServer│ │  Lobby   │ │ChatPanel │ │  Voice │  │
│  │          │ │          │ │          │ │Controls│  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
│                                                       │
│  ┌──────────────────┐  ┌─────────────────────────┐   │
│  │ SocketContext     │  │ useWebRTC / useAudio    │   │
│  │ (connection mgmt) │  │ (P2P voice & screen)    │   │
│  └──────────────────┘  └─────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

**Çalışma mantığı:** Host uygulamayı açtığında `7432` portunda Express + Socket.IO sunucusu başlar. Sunucu signaling, chat kalıcılığı, dosya yükleme ve davet doğrulamayı yönetir. Ses ve ekran paylaşımı WebRTC üzerinden peer-to-peer çalışır; ses sunucu üzerinden geçmez. Misafirler, LAN üzerinden veya internet için tünel aracılığıyla davet linkiyle bağlanır.

## İnternet Üzerinden Bağlantı

Yerel ağ dışındaki arkadaşlar için herhangi bir TCP tünelleme aracı kullanabilirsin:

```bash
# ngrok
ngrok http 7432

# Cloudflare Tunnel
cloudflared tunnel --url http://localhost:7432

# localtunnel
npx localtunnel --port 7432
```

Oluşan public URL'i uygulamadaki "Public URL" alanına yapıştır; üretilen davet linkleri otomatik olarak bunu kullanır.

## Opsiyonel: Cloudflare TURN (Önerilen)

Yüksek trafik ve daha stabil relay için runtime ICE katmanını Cloudflare TURN'a bağlayabilirsin.
Uygulama açılışında öncelik sırası:

1. Cloudflare TURN (varsa)
2. Supabase ICE tablosu (varsa)
3. Yerel `src/shared/iceConfig.ts` fallback

Uygulamayı başlatmadan önce ortam değişkenlerini ayarla:

```powershell
$env:CLOUDFLARE_TURN_KEY_ID="YOUR_TURN_KEY_ID"
$env:CLOUDFLARE_TURN_API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN"
$env:CLOUDFLARE_TURN_TTL_SEC="14400"  # opsiyonel, varsayilan 4 saat
npm start
```

Notlar:

- `CLOUDFLARE_TURN_API_TOKEN` TURN credential üretme yetkisine sahip olmalı.
- Tarayici tarafinda sorun cikarabilen `:53` TURN URL'leri otomatik filtrelenir.

## Opsiyonel: Supabase ICE Yapılandırması

WebRTC `iceServers` bilgisini Supabase'te tutup hostların çalışma anında çekmesini sağlayabilirsin.

Uygulamayı başlatmadan önce ortam değişkenlerini ayarla:

```powershell
$env:SUPABASE_URL="https://kvtqmpwjbeeqzpnkzraw.supabase.co"
$env:SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
npm start
```

`webrtc_ice_servers` adında bir tablo oluştur:

```sql
create table if not exists public.webrtc_ice_servers (
  id bigserial primary key,
  urls text not null,
  username text null,
  credential text null,
  enabled boolean not null default true,
  sort_order integer null
);

alter table public.webrtc_ice_servers enable row level security;

create policy "public read ice servers"
on public.webrtc_ice_servers
for select
to anon, authenticated
using (true);
```

Örnek seed verisi:

```sql
insert into public.webrtc_ice_servers (urls, username, credential, enabled, sort_order) values
('stun:74.125.250.129:19302', null, null, true, 10),
('turn:15.235.47.158:3478', 'openrelayproject', 'openrelayproject', true, 20),
('turn:15.235.47.158:3478?transport=tcp', 'openrelayproject', 'openrelayproject', true, 30);
```

Supabase erişilemezse veya tablo boşsa The Inn otomatik olarak yerel `src/shared/iceConfig.ts` ayarlarına fallback yapar.

## Lisans

[MIT](https://opensource.org/licenses/MIT) — Utku Sahin
