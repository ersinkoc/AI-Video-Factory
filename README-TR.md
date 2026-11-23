# AI Video Factory

[English](README.md) · **Türkçe**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Release](https://img.shields.io/github/v/release/ersinkoc/AI-Video-Factory)](https://github.com/ersinkoc/AI-Video-Factory/releases)

![AI Video Factory 0.6.0 — 64 stil, tek video fabrikası.](docs/assets/ai-video-factory-0.6.0-styles.png)

Bir konudan seslendirilmiş, animasyonlu YouTube videosu üretin. Claude ajanları hikâyeyi ve senaryoyu yazar, çekimleri planlar, vektör çizimleri tasarlar ve sonucu inceler. Medya sağlayıcıları ses, görsel ve klipleri üretir; Remotion son videoyu render eder. Aynı fabrika kendi görüntünüzden ya da bir YouTube videosundan dikey Short keser ve bir briften hareketli grafik filmi yapar. Web Stüdyo süreci görünür kılar, onayları size bırakır.

[Dokümanlar](docs/README.md) · [Başlangıç](docs/GETTING_STARTED.md) · [Stüdyo rehberi](docs/STUDIO.md) · [CLI rehberi](docs/CLI.md) · [Sürüm geçmişi](CHANGELOG.md)

## Neler yapabilirsiniz?

- **Dört görsel mod:** iskeletli vektör animasyon, hareketli sabit görseller, görsel ve AI klip karışımı veya tamamen üretilmiş klipler.
- **64 stil paketi:** tutarlı palet, çizim kuralları ve dokular; yeniden kullanılabilen karakterler, sunucular ve seri ayarları.
- **Birden fazla dilde seslendirilmiş video:** eşzamanlı altyazı, dudak hareketi, müzik ve ses efektleri. Stüdyo Türkçe ve İngilizce kullanılabilir.
- **Yayın paketi:** video, `.srt` altyazı, başlık, açıklama, bölümler, etiketler, kapak görseli ve yatay bölümlerden dikey Short.
- **Kendi görüntünüzden Short:** videolarınızı ve resimlerinizi yükleyin, süreyi seçin (15–180 sn); AI en iyi anları seçer, 9:16'ya kadrajlar, anlatım ekler ya da asıl konuşmayı korur, altyazı, ekran yazıları, müzik ve efekt sesleriyle birlikte işler.
- **Hareketli grafik filmi:** insan figürü ve çizim yok. Yönetmen ajanı bir ritim çizelgesi ve kinetik yazı, grafik ve sayaç, sistem diyagramı, kart ızgarası ve montajı, parçacık alanı ve basit 3D nesneden sahneler yazar; kod bunları vuruşa oturtarak çizer, aynı tempoda sentezlenen müzik ve efekt ekler. Bir brif, isteğe bağlı marka renkleri ve logo ya da ekran görüntüleri verirsiniz; 16:9 ya da 9:16, anlatım isteğe bağlı. Her sahnenin render'dan önce bir önizleme karesi olur; kare denetimi kesik, çakışan ya da okunmayan yazıya ve eksik öğeye bakar; anlatımsız filmde 8/10'un altındaki sahneler bir kez yönetmene geri döner. Brifte olmayan rakamlar "temsili veri" rozeti taşır. Filmi bir notla yeniden yaptırabilir; kapak karesi, yayın paketi ve 16:9 filmden dikey bir Short alırsınız.
- **YouTube videosundan Short:** sahibi olduğunuz bir videonun adresini verin; video indirilip sahne sahne incelenir, sahne günlüğü, kesilecek yerler ve puanlı Short adayları çıkar. Seçtiğiniz adaylar asıl konuşması altyazılı dikey Short olur.
- **ACP ile istediğiniz model:** Claude'un yanında her ajan, Antigravity (`agy`) gibi bir Agent Client Protocol ajanında ve onun Gemini, Claude ya da GPT-OSS modelleriyle çalışabilir; seçim Modeller sayfasında ajan başına yapılır. Bütün ajanları böyle çalışan anlatımsız bir hareketli grafik filmi hiçbir ücret doğurmaz.
- **Üretim boyunca inceleme:** senaryo ve konsept onayları, çekim önizlemeleri ve çizim denetimleri. Render'dan önce her kare bir kontrol listesiyle denetlenir ve 8/10 almalıdır; barajın altındaki sahneler yeniden planlanır, altında kalan sahne varken render onayınızı bekler. Seçili çekimleri bir notla yeniden yaptırabilir, bölümü render etmeden tarayıcıda oynatabilirsiniz.
- **Kaldığı yerden süren, maliyeti izlenen üretim:** aşama kaydı, üretim önbelleği, yedek sağlayıcı ve ücretli çağrılardan önce tahmin.

Bölüm bütçesi ücretli görsel, ses ve video API'lerini sınırlar. Claude ajan kullanımı ayrı izlenir ve bu sınırı aşabilir. Ayrıntılar [Üretim özellikleri](docs/FEATURES.md) rehberinde.

## Hızlı başlangıç

**Node.js 24+**, **pnpm 11**, **FFmpeg** ve oturum açılmış bir Claude Code kurulumu ya da `ANTHROPIC_API_KEY` gerekir. Kullanacağınız ses, görsel ve video servislerinin anahtarlarını ekleyin. Docker isteğe bağlıdır.

```sh
git clone https://github.com/ersinkoc/AI-Video-Factory.git
cd AI-Video-Factory
pnpm install
cp .env.example .env
```

PowerShell'de son adım için `Copy-Item .env.example .env` kullanın. `.env` dosyasına anahtarlarınızı girin; anahtarı boş sağlayıcılar devre dışı kalır. Ardından Stüdyo'yu başlatın:

```sh
pnpm studio
```

**<http://localhost:3100>** adresini açın, bir bölüm oluşturun ve üretimden önce senaryo ile konsepti inceleyin. Tarayıcıda akıcı bölüm oynatımı için `pnpm studio:build`, ardından `pnpm studio:start` kullanın.

Kurulumu incelemek veya ücretli API çağrısı yapmadan yerel render denemek için:

```sh
pnpm ys doctor
pnpm ys render-demo
```

Demo, önizleme onayında durur; render'ı tamamlamak için [demo adımlarını](docs/CLI.md#local-render-demo) izleyin.

Varlıklar, maliyet defteri ve bölümler varsayılan olarak `.data` altında tutulur. Stüdyo'da giriş sistemi yoktur ve `127.0.0.1` üzerinde çalışır; ağ erişimini güvendiğiniz kişilerle sınırlayın. Yapılandırma için [Başlangıç](docs/GETTING_STARTED.md), ağ ayarları için [Stüdyo erişimi](docs/STUDIO.md#start-and-access) rehberine bakın.

## CLI ile bölüm oluşturma

```sh
pnpm ys episode new --topic "Ottoman coffeehouse bans" --lang en --minutes 3 --motion vector --budget 5 --manual
```

Komutun döndürdüğü bölüm kimliğini kullanın:

```sh
pnpm ys episode run <id>
pnpm ys episode show <id>
```

`--manual` onay kapılarında durur. Üretim, yapılandırdığınız Claude hesabını ve medya sağlayıcılarını kullanır. Onaylar, seçenekler, yeniden deneme ve karakter kullanımı [CLI rehberinde](docs/CLI.md) açıklanır.

Bunun yerine kendi videolarınızdan ve resimlerinizden dikey Short kesmek için:

```sh
pnpm ys episode new --footage gezi.mp4 --footage gundogumu.jpg --sec 30 --overlay "Hayatımın sabahı" --manual
```

Ya da bir briften hareketli grafik filmi yapın (anlatımsız film ücretli API kullanmaz; 9:16 için `--vertical` ekleyin):

```sh
pnpm ys episode new --film --topic "Relay dağıtımları 40 dakikadan 12'ye indiriyor" --sec 30 --color "#2563eb" --asset logo.png
pnpm ys episode run <kimlik>
```

Ya da uzun bir YouTube videonuzu Short için analiz ettirin ([yt-dlp](https://github.com/yt-dlp/yt-dlp) gerekir):

```sh
pnpm ys episode new --youtube https://www.youtube.com/watch?v=<kimlik> --count 6 --min 20 --max 60
pnpm ys episode run <kimlik>
pnpm ys episode shorts <kimlik> --candidates c1,c3
```

## Dokümanlar

Ayrıntılı rehberler İngilizce tutulur; proje planı Türkçedir.

| Yapmak istediğiniz | Rehber |
| --- | --- |
| Kurmak, yapılandırmak veya güncellemek | [Başlangıç](docs/GETTING_STARTED.md) |
| Tarayıcıda bölüm oluşturmak ve düzenlemek | [Stüdyo](docs/STUDIO.md) |
| Üretimi terminalden yönetmek | [CLI](docs/CLI.md) |
| Stilleri, animasyonu ve üretim davranışını incelemek | [Üretim özellikleri](docs/FEATURES.md) |
| Düzenleme, kaynak ve kalite denetimi araçlarını bulmak | [Doküman dizini](docs/README.md) |
| Kod tabanı veya sürümler üzerinde çalışmak | [Geliştirme](docs/DEVELOPMENT.md) |

Mimari kararlar ve planlanan işler [proje planında](docs/PROJE_PLANI.md), sürüm geçmişi [değişiklik günlüğünde](CHANGELOG.md) yer alır.

## Sponsor

[**WrongStack**](https://wrongstack.com) — proje hafızasını oturumlar arasında koruyan, açık kaynaklı AI kodlama ajanı. [Web sitesi](https://wrongstack.com) · [GitHub](https://github.com/WrongStack/WrongStack)

## Lisans

[MIT](LICENSE) © 2026 Ersin KOÇ. Üçüncü taraf bileşenler, üretilen medya ve referans varlıklar kendi koşullarına tabidir; [Remotion lisansını](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md), medya sağlayıcınızın koşullarını ve her varlığın kaynak lisansını inceleyin.
