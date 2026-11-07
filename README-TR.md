# AI Video Factory

[English](README.md) · **Türkçe**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Release](https://img.shields.io/github/v/release/ersinkoc/AI-Video-Factory)](https://github.com/ersinkoc/AI-Video-Factory/releases)

Tek bir konudan çok dilli, animasyon ağırlıklı YouTube videoları üreten bir AI video fabrikası. Hikâyeyi ve senaryoyu Claude ajanları yazar; çekimleri planlar, vektör çizimleri tasarlar ve kendi çıktılarını denetler. Ses, görsel ve video kliplerini ücretli medya API'leri üretir, son kurguyu Remotion render eder. Web tabanlı Stüdyo her adımda ne olduğunu gösterir ve son kararı insana bırakır.

Mimari, sağlayıcı seçimi ve yol haritası: [docs/PROJE_PLANI.md](docs/PROJE_PLANI.md). Sürüm geçmişi: [CHANGELOG.md](CHANGELOG.md).

## Sponsor

<table>
  <tr>
    <td width="96" valign="top">
      <a href="https://wrongstack.com"><img src="https://raw.githubusercontent.com/WrongStack/WrongStack/main/website/public/wrongstack.svg" width="80" height="80" alt="WrongStack"></a>
    </td>
    <td>
      <strong><a href="https://wrongstack.com">WrongStack</a></strong>: <em>senin</em> kod tabanını zamanla daha iyi tanıyan, ücretsiz ve açık kaynak (MIT) bir AI kodlama ajanı. Kodu okur, araçları çalıştırır ve uzman ajanları koordine eder; oturumlar arasında kalıcı hafızası ve görünür izin sınırları vardır, abonelik gerekmez. Tek başına çalışan tek bir dosya, Node.js gerekmez.<br><br>
      macOS / Linux: <code>curl -fsSL https://wrongstack.com/install.sh | sh</code><br>
      Windows: <code>irm https://wrongstack.com/install.ps1 | iex</code><br><br>
      <a href="https://wrongstack.com">wrongstack.com</a> · <a href="https://github.com/WrongStack/WrongStack">GitHub</a>
    </td>
  </tr>
</table>

## Özellikler

- **Konudan bitmiş videoya.** Pipeline şu aşamalardan geçer: stil → hikâye → senaryo → *onay* → kadro → konsept → *onay* → ses → çekimler → kareler → klipler → kurgu → render → yayın paketi → Short → inceleme. Her aşama idempotent'tir ve her alt adımdan sonra kaydeder; hata alan çalıştırma kaldığı yerden devam eder.
- **Dört hareket modu:**
  - `vector`: Claude'un çizdiği iskeletli SVG karakterler, hareketleri kodda. En ucuz mod.
  - `still`: Ken Burns hareketli görseller.
  - `mixed`: bazı çekimler AI video klibi olur.
  - `animated`: her çekim AI video klibi olur.
- **Kalite kapısı.** Hiçbir SVG denetlenmeden kullanılmaz:
  1. Çizimden önce bir planlayıcı ajan referans görsellere bakar ve tarifi somut bir çizim planına çevirir.
  2. Kör denetçi, çizimin adını bilmeden ne gördüğünü söyler. Mekânlar seyirciden bakılan bir sahne gibi çizilir: yol, ray ya da nehir kadrajı boydan boya geçer, ufka uzanmaz, çünkü araçlar yandan çizilir.
  3. Kapı ajanı çizimin ne kadar tanınır olduğunu ve referanslara ne kadar sadık olduğunu puanlar; karakterde kolların, ellerin ve bacakların hareket ederken doğal görünüp görünmeyeceğini de (boru gibi ön kol, eldiven gibi el, uzuvda leke geçmez).
  4. Geçemeyen çizim kusur listesiyle yeniden çizilir. Yine geçemezse kullanılmaz. Birden çok çekimde geçen ana nesne bir kez daha, sade ve ikon gibi bir tarifle denenir; o da geçemezse onu kullanan sahneler boş bir oda göstermek yerine onsuz yeniden planlanır.
- **Gerçeğe dayalı.** Gerçek özneler Wikipedia ve Wikimedia Commons'ta bulunan referans görsellere bakılarak çizilir. Gerçek bir kişinin fotoğrafları önce bir kez ölçülür: yüz biçimi, kaşlar, gözler, burun, saç ve saç çizgisi, sakal, gözlük ve beden yapısı bir benzerlik kaydına geçer (ortalamadan ayrılan özellikler, renkler hex olarak); tasarımcı ona göre çizer, kalite kapısı onu arar. Analiz kişinin adını söylemez, biçim ve renk dışında bir çıkarım yapmaz, reşit olmayabilecek kişiyi atlar. Nesneler için önce Commons'taki kamu malı/CC0 hazır vektör çizimler denenir; ancak aynı kalite kapısından geçerse kullanılır ve çizilen nesne gibi gerçek boyuna ölçeklenir (viewBox'ı olmayan dosyalar eskiden dosyanın piksel boyutunda görünüyordu: kişiyi örten dev kitap, kaybolan dizüstü). Harita ve bayrakları Claude çizmez; gerçek veriden üretilir (world-atlas, flag-icons). Tarihî bir olayın haritası o yılın sınırlarıyla çizilir (Cliopatria veri seti, Seshat Global History Databank, CC BY 4.0; ilk kullanımda bir kez indirilir), bugünkü ülkelerle değil; kaynak satırı yayın açıklamasına kendiliğinden eklenir.
- **Son söz insanın.** Stüdyo'da kapının reddettiği bir çizimi kabul edebilir, geçirdiğini de tasarımcıya bir notla reddedebilirsin. Gerçeklik denetimini bir bölüm için kapatabilirsin.
- **64 hazır stil paketi.** Örneğin düz anlatım, Osmanlı minyatürü, kara film, teknik çizim, ukiyo-e, synthwave, kara tahta, suluboya, 8-bit piksel, risograf, vitray, izometrik diorama, Bizans mozaiği, Mısır duvar resmi, Yunan vazo resmi, Anadolu kilimi, mürekkep yıkaması, manga (tram), kesit çizimi ve beyaz tahta; ayrıca dört 3D görünümlü paket (yumuşak 3D, kil animasyon, oyuncak figür, low-poly): vektör modunda bu paketlerin karakterleri three.js ile koddan kurulan gerçek 3D figürlerdir (mat, kil, parlak ya da köşeli yüzey; ucuz bir ajan onaylı çizime bakıp ten, saç, sakal, gözlük, kıyafet ve yapıyı seçer). Figürler kuklanın bütün pozlarını, jestlerini ve konuşan ağzını korur, yürürken yana döner; render ücretsiz kalır. Konsept adımı, karakter bankası ve stil galerisi figürün kendisini gösterir (yerelde render edilen önizleme, 3D işaretiyle). Bu paketlerde mekân ve nesnelerin hacmi SVG degradeleri, ışık yansımaları ve temas gölgeleriyle verilir. Görsel/video modlarında paketler gerçek 3D render ister. *Otomatik* modda ucuz bir ajan konuya uyan paketi seçer; istersen kendin seçebilir ya da *Özel* ile sanat yönetmenine serbest tasarım yaptırabilirsin. Paket renkleri, çizim kurallarını ve çizgi stilini sabitler; aynı paketteki bölümler aynı elden çıkmış görünür. Liste için: `pnpm ys styles`. Yeni bölüm formunda bir galeri her pakette aynı karakteri ve odayı gösterir; tıklayınca o paket seçilir. Örnekler o pakette çizilmiş bölümlerden alınır; eksikleri `pnpm ys styles samples [paket...]` gerçek tasarımcı ve kalite kapısıyla çizer (Claude, paket başına ~$0,2–0,3). Her örnek karakter o stilde sunucu olarak karakter bankasına da girer. Paketlerin bir de dokusu var: render bunu her vektör sahnenin üstüne koddan bindirir (kağıt, suluboya, tebeşir, halftone, gravür taraması, film greni, ekran çizgisi); paketler yalnız renkle ayrışmaz. Suluboya paketlerinde kişi ve nesneler gerçek bir kâğıttaki gibi opak bir kâğıt zemininin üstüne boyanır: lekeler birbirinin üstünde saydam kalır, ama oda bir kişinin ya da masanın içinden görünmez.
- **Fiziğe uyan vektör animasyon.** Karakterler iskeletli kuklalardır, tamamen kodla hareket eder: yerdeki şey havalanmaz, yürüyüş adımları alınan yoldan sayılır, elde tutulan nesne elde kalır ve bir karakter çekimde yalnız bir kez görünür. Jestlerde hazırlık ve taşma vardır; işaret hedefe uzanır, nesne kol boyundan yakınsa dirsek bükülür ve parmak ucu onu örtmeden kenarında durur, gözler konuşulan kişiyi izler, anlatırken baskın el kullanılır. Ağız anlatımı konuşur: her sesin kendi ağız şekli vardır (m, b ve p'de dudaklar kapanır, a'da geniş açılır, o'da yuvarlak, u'da büzük, f ve v'de dişler dudakta); şekil koddan, her çizimin ölçülen ağzının yerine çizilir. Endişeli, üzgün ya da kızgın yüzün ağzı da koddan, köşeleri aşağı çizilir (çizimlerin kendi ağzı hafif bir gülümsemedir). Tepkiler de ağzı açar: irkilen kişide yuvarlak bir "o", sevinende geniş açık ağız; irkilen kişi geriye çekilir, bir eli göğsünde, öbürü avucu dışa dönük, onu irkilten şeye doğru kalkık. Duygu kaşlardan okunur: çizimin kendi kaşları sol ve sağ diye ayrılıp koddan eğilir; endişede ve üzüntüde iç uçlar kalkar, öfkede iner ve çatılır, düşünürken tek kaş kemerlenir. Baş vurgulu kelimede iner kalkar, cümle başında kaşlar kalkar, el vurgusu vurgulu kelimeye denk gelir. Kelime zamanları kayıttaki duraklamalara hizalanır; altyazı, dudak ve jestler anlatıcı durduğunda durur. Kol yana uzanınca el bilekte döner; başparmak yere değil yukarı bakar. Yüz gerçek bir baş gibi döner: gözler bir yana bakınca burun da onlarla kayar, göz burna girmez ve gözlük burnun üstünde kalır; gözler ve ağız yüzün çizgisini geçmez, gözleri yüzün kenarına çizilmiş dar yüzde bakışı göz bebekleri verir; boyun da giysinin üstünde değil yakanın arkasındadır. Düşünen karakter her çekimde üç duruştan birini alır: çenesini yüzünün önündeki eline yaslar (dirseği öbür elinde, parmaklar ağzın altında), başının yanını kaşır ya da kollarını kavuşturup başı yatık yukarı bakar. Karakterler anlatılan işi de yapar: klavyede yazar, kalemle yazar, sayfa okur, nesneyi herkes görsün diye havaya kaldırır, alkışlar, ellerini beline koyar, kollarını kavuşturur, elindekini birine uzatır, evet diye başını sallar, hayır diye iki yana çevirir, omuz silker, sevinir, el sallar, şaşırıp geri çekilir, düşünür (yönetmen yalnız genel bir el hareketi planladıysa çekim açıklamasının anlattığı iş o kişiye kodla verilir, render sahneleyemiyorsa verilmez), yüz de açıklamanın o kişiye verdiği duyguyu taşır (endişeli, üzgün, kızgın, şaşkın, mutlu, düşünceli), yönetmen başka bir ifade seçmiş olsa bile; alkış, tuş ve kalem sesi ellerle aynı anda duyulur. Yanındakini işaret eden ya da ona doğru anlatan el ikisinin arasındaki orta çizgide durur; iki el havada buluşmaz. Karakterler kameraya bakmak yerine yanındakine döner: dinleyen konuşana döner, konuşan yarı yarıya; 3D figürler gerçekten döner. Ayakta duran karakter ağırlığını bir bacağa verir ve arada öbürüne geçer; dinleyenler kollar yanda aynı sırada dikilmek yerine kendi rahat pozunu alır (bir eli belde, elleri önde birleşik). Dinleyenin duygusu bedenine de geçer: endişeli ellerini ovuşturur, kızgın kollarını kavuşturur, üzgün çöker. İsteğe bağlı yan görünüşle yürüyen karakter profile döner. Çok kullanılan odaya bir kez ters açı çizilir (aynı yerin karşı duvarı, ilk görünüşle karşılaştırılarak denetlenir); o odada art arda gelen çekimler aynı duvarı tekrar göstermek yerine iki açı arasında gider. Her mekâna o yerde o dönemde gerçekten duran en çok iki büyük eşya da konur (kitaplık, dolap, uzun saksı): ucuz bir ajan seçer, her nesne gibi referansla bir kez çizilir; geniş ve orta çekimlerde kod onları odanın dibine, eylemin arkasına yerleştirir, oda tek kişinin ardında çıplak bir duvar göstermez. Eşya çekimden çekime yerini korur, ters açı öbür duvarı gösterir, tahtayı ya da pencereyi örtmez, kamera kadrajı o yokmuş gibi kurar. Ekranlar ve tahtalar çekimin anlattığını gösterir: yönetmen monitörün, dizüstünün, televizyonun, telefonun, dev ekranın ya da kara tahtanın ne gösterdiğini yazar (renklendirilmiş kod, komut satırı, web sayfası, arama, sohbet, başlık ya da bir kişinin yüzü), kod bunu çizimin kendi ekranına çizer; aynı bilgisayar her çekimde yeni bir şey gösterir. Ekran yazısı satır sonunda sarılır ve karede okunur boyda kalır; küçük ekranda sohbet en yeni mesajlarını gösterir. Karakterler çizgi roman balonlarıyla konuşur ve düşünür: sözü yönetmen yazar, balonu kod başın yanına, kuyruğu ağza doğru ve başın kenarında biten, yüzleri ve başlıkları örtmeden çizer. Özne çok küçük kalacaksa yakın çekim kendini yeniden çerçeveler; nesneye yaklaşan kamera yönetmenin kadraja koyduğu herkesi kadrajda tutar (dizüstünün yakın çekimi başında çalışan kişiyi artık kadrajdan atmaz). Geniş çekimdeki küçük ana nesne (bir sayfa, ekran, çip) yuvarlak bir büyütme balonunda, işaret çizgisiyle gösterilir; balon hiçbir yüzü, gövdeyi ve yazıyı örtmeyen, işaret çizgisi yüzlerden ve gövdelerden geçmeyen yere konur (masa gibi bir mobilyaya hiç açılmaz), çekim boyunca orada durur ve nesnesi sahneye girdikten sonra açılır; her yer bir kişiyi örtecekse hiç açılmaz. Ekranda (dizüstünde bir sayfa, bir sohbet, kod) ölçü üstündeki yazının okunup okunmadığıdır: balon o zaman cihazın bütününü değil ekranın kendisini büyük gösterir. Yönetmenin yakın çekimi küçük bir nesneye odaklanmışsa ve nesne yine okunur boya gelemiyorsa (bir çip, çek, pul, tokmak) çekim makro ek çekime döner: nesne yerine oturduktan sonra arkasındaki sahne yumuşayıp kararır (kişiler tanınır kalır), nesne ekran içeriğiyle birlikte karenin ortasına büyür ve üstünde durduğu masanın büyütülmüş şeridinde durur. Kişiye odaklanan yakın çekimde, baş kadrajda kalmak zorunda olduğu için nesne küçük kalıyorsa yerine balon açılır. Kamera bir objektif gibi davranır: yaklaştıkça netlik öznede kalır, duvar, figüranlar ve öznenin çok önündeki ya da arkasındaki kişiler yumuşar (alan derinliği; geniş çekim her yerde nettir, konuşan herkes ve çekimin anlattığı her yazı net kalır), ekranlar hafifçe parlar, kare de kusursuz donmuş durmak yerine sehpadaki bir kamera gibi bir iki piksel salınır. Render süresine ölçülebilir bir yük getirmez. Odaya ışık bir yandan düşer: odanın kendi çiziminde bulunan pencerenin ya da lambanın yanından (en parlak orta boy şekiller), belirgin değilse her oda için sabit bir yandan; odanın ters açısı öbür yandan aydınlanır. Her çekim anlattığı nesneyi bilir (yönetmen söyler ya da çekim açıklamasından çıkarılır): nesneler gerçek boyunda kalır, o nesne okunmayacak kadar küçükse balondan önce kamera ona yaklaşır; herkesin başı kadrajda ve üstte kalır. Kişinin yanında havada gösterilen nesne elde tutulandan küçük çizilmez. Ad etiketleri çizilen kafanın hemen üstündedir; gerçek bir kişi bölümde ilk göründüğü yerde adlandırılır (sahneler ayrı planlandığından etiketi oraya kod koyar, yönetmenin başka yerde kullandığı yazılışla); altında biri varsa bilgi kartı karşı üst köşeye geçer; aynı banka oturanlar yan yana oturur; geniş çekimde ayakta duran iki kişi odanın iki ucunda kalmaz, konuşma mesafesine (yaklaşık 1,1 m) gelir, aralarındaki masa ya da panonun kenarında durur; yan yana sıra hâlinde duran üç ve daha çok kişi kameraya açık hafif bir yay kurar (uçtakiler bir adım önde, ortadakiler bir adım geride); öndeki kişi arkasındakinin yüzünü kapatacaksa kenara çekilir; yönetmenin yarısını resmin dışına koyduğu eşya (at, top, çuval yığını) üstündekilerle birlikte içeri alınır; alçak bir masanın hemen ardında duran kişi masanın yanına geçer (ayakları masanın arkasında kalınca masanın üstünde duruyor gibi görünüyordu); tezgâhın ardındaki kısa biri başı ve omuzları tezgâhın üstünde görünecek kadar yükselir, tabelanın direğine denk gelmez; masadaki monitör arkasındaki kişinin yüzünü örtüyorsa masa üstünde yana kayar. Kamera ayaktaki kişiyi bilekten, baldırdan ya da dizden kesmez, yakın çekimde de: ya ayaklar kadrajdadır ya da kesim uyluk ortasında ya da daha yukarıdadır; kadrajı kaydırmak yetmezse biraz yaklaşır ya da geri çekilir. Çıplak duvarı ve zemini çok olan geniş çekim orta plana yaklaşır; bunun için kişilerin yanındaki uzun makine ya da dolap tabanından biraz kesilebilir, küçük eşyalar bütün kalır, duvardaki grafik, saat ya da tabela kadraj kenarında kesik kalmaz. Kişinin yakın çekimi onu belden yukarı, kafanın üstünde küçük bir payla çerçeveler (yönetmenin 1,5–2 zoom'u eskiden boş bir duvarın altında küçük, tam boy bir figür gösteriyordu); 3D figürler ekran çözünürlüğünde çizilir, yakın çekimde keskin kalır. Aynı odada aynı kişileri gösteren art arda iki çekim aynı boydaysa ikincisinin boyu değişir (geniş, orta, yakın); kesme atlama gibi görünmez. Konfeti, kıvılcım ve toz karakterlerin arkasından yağar; sis uzaklaştıkça koyulaşır, kişilerin arkasındaki odayı pusa boğar, önlerinde yalnız ince bir yer sisi süzülür; ekrandaki yazıyı hiçbir şey örtmez. Sevinen kişi dirsekleri bükülü yumruklarını baş hizasında inip kaldırır, herkes kendi ritmiyle; alkışta avuçlar göğsün ortasında buluşur; klavyede eller klavyenin iki yarısında durup tuşlara basar, yazarken kalemli el satır boyunca ilerler, öbür el kâğıdı tutar. Kadrodan kalabalık sahnelerde (ordu, seyirci, protestocular, pazar) figüranlar kodla çizilir: kadronun arkasında sıra sıra duran, gündelik giysili, takım elbiseli, üniformalı ya da cübbeli isimsiz insanlar (kadronun oranlarında, dirsekte bükülen kollar, yumruklar, bağıran ya da gülen yüzler; kimi eli belde, kimi kolları kavuşuk, protestoda kimi sağ, kimi sol, kimi iki yumruğunu kaldırır); ayakta durur, dinler, sevinir, alkışlar, protesto eder ya da ileri yürürler, arkalarındaki hiçbir şeyi örtmezler. Sesleri de duyulur: alkış, tezahürat, uğultu, yumruklar kalkarken slogan, yürüyüşte adımlarla aynı anda ayak sesleri. Klavyede ya da kâğıtta yazan kişi masasının arkasında durur (masanın yanındaki sandalye oturanıyla masanın arkasına kayar), elleri masanın gerçek yüksekliğine gider: yüksek tezgâhta kalkar, otururken masanın üstündedir, alçak masaya iner. Beyaz tahtaya, kara tahtaya ya da kâğıt sehpasına yazan kişi yazının önünde değil tahtanın kenarında durur; kalemi tahtanın içinde satır boyunca ilerler, başı tahtaya döner. Hiçbir poz insan bedeninin yapamayacağı bir şey yapmaz: eklem sınırları klinik hareket açıklığı tablolarından gelir (dirsek en çok 150° bükülür, kısalan uzuvların derinliği geri kurularak 3B açıyla ölçülür; diz yana bükülmez; omuz gövdeyi ancak yapabildiği kadar çaprazlar), sınırı aşan render'da kırpılır, bir test her jesti, her jest çiftini, oturan, nesne tutan, aynalanan ve yürüyen pozları tarar. 3D figürde kısalan ön kol ya da uyluk ezilmez, kameraya döner. Render'dan önce her çekim kodla denetlenir: kadraj kenarında yarım yüz, eşyanın ardında kalan yüz, yüzün üstündeki yazı, birbirinin içinden geçen kişiler, boşluğu gösteren el, masadan uzakta klavye, çizilemeyen nesne, boş kadraj, karede sıçrayan eklem, insan sınırını aşan eklem. Anlamı bozmadan düzeltilebilen render'da düzeltilir: kişi masasının başına geçer ya da tezgâhın arkasından çıkar, okumak için yanındaki kitabı eline alır, yürüyen kişi öbürünün içinden değil önünden geçer, sevinç bütün çekim değil birkaç saniye sürer, kamera yerinde duran her yüzü ya tamamen kadrajda ya tamamen dışında tutar; kareden kat kat uzun roket, savaş gemisi ya da hisar tabanının bir şeridi yerine, uzaktan görülüyormuş gibi bütün gösterilir; kadrajın yanında yalnız ince bir şeridi görünecek eşya biraz daha içeri alınır ya da dışarıda bırakılır. Hatası kalacak sahneleri yönetmen yeniden planlar.
- **Her bölümden dikey Short.** Yayın ajanı ardışık sahnelerin en güçlü 20–60 saniyesini seçer; kod onları API maliyeti olmadan 9:16 olarak yeniden render eder, müzik ve efektler kısaya göre yeniden üretilir. Dikey kadrajda sahne gerekirse çekim başına küçülür, kenardaki karakterler kesilmez.
- **API maliyeti olmadan müzik ve ses.** Arka plan müziği koddan sentezlenir: bölümleri yönetmenin her çekime verdiği havaya (aydınlık, sıcak, soğuk, gece, dramatik) uyar, hepsi aynı anahtarda ve çapraz kararmalı; anlatım sırasında kelime kelime kısılır. Vektör modunda animasyonlara kareye kilitli efekt sesleri de eklenir. İkisi de bölüm başına bir anahtardır.
- **Sahne geçişleri ve parça parça kurulma.** Sahne içinde çekimler kısa bir çapraz geçişle değişir; sahne değişince yeni sahne perde gibi silinerek, kayarak, daire açılarak ya da yakınlaşarak gelir (art arda aynısı gelmez); hızlı hareket ederken, bir kamera obtüratörünün çizeceği gibi hareket bulanıklığı alır (kayan kare yana doğru iz bırakır, perdenin ya da dairenin kenarı yumuşar, yakınlaşma hafifçe bulanıklaşır; sahne değişimi başına yaklaşık bir saniyelik render; kayarak, patlayarak ya da titreyerek yerine gelen nesneler de aynı biçimde iz bırakır, kişiler bırakmaz) ve ilk çekimi parça parça kurulur: önce oda, sonra eşya ve nesneler, en son kişiler. Nesneler ve yazılar yönetmenin seçtiği anda bir saniyeden kısa sürede büyüyerek, kayarak ya da solarak gelir; hiçbir şey saniyelerce yarı saydam kalmaz ya da büyümeyi sürdürmez.
- **Düzenli ekran yazıları ve isteğe bağlı altyazı.** Mekân, tarih ve olay satırları sol üstte tek bir bilgi kartında, kişi etiketleri kişinin yanında durur. Altyazı her zaman videonun yanına `.srt` olarak yazılır; videoya gömülmesi bölüm başına bir anahtardır.
- **Karakter bankası.** Konudan bağımsız karakterleri (sunucu, bilim insanı, çocuk…) sakla; ekrandaki sunucu yap, kadroya ekle ya da seri maskotu yap. Hiçbir zaman yeniden çizilmezler.
- **Karakterleri tekrar kullanma.** Onaylı karakterler kimlikleriyle birlikte kütüphanede tutulur. Aynı kişi aynı stilde yeniden geçerse (ör. gerçek bir tarihî kişi ya da kanalın sunucusu) casting ajanı çizimi yeniden çizdirmek yerine tekrar kullanır. Stüdyo'da *Kütüphaneden kullan* ile kendin de seçebilirsin. Liste için: `pnpm ys library`.
- **Seriler.** Bölümler bir seriye ait olabilir. Ana sayfa seriye göre filtreler. Var olan bir seriye eklenen yeni bölüm serinin ayarlarını ve stil paketini devralır; tekrar kullanım için önce o serinin karakterleri önerilir. CLI'da `--series "Ad"`.
- **Öğrenme döngüsü.** Her render'dan sonra kareler bölümün kendi stili ve paletine göre incelenir (sepya ya da tek renkli bir stil kusur sayılmaz); her kare çekimin planlanan jestlerinin tam kalktığı (daha kalkarken ya da inerken değil), yazılarının açıldığı bir andan alınır; çıkan dersler sonraki bölümlerin uyduğu kural defterine yazılır, hiçbir ders stilin paletini ezmez. Render'dan önce taslak inceleme aynısını önizleme kareleriyle yapar: yönetmen en zayıf sahneleri taslak karelerine bakarak yeniden planlar, yeniden planlanan sahneler tekrar incelenir, puanı düşen yeni plan geri alınır ve yönetmene neyin tutmadığı söylenir, hâlâ zayıf kalan sahneler ikinci bir tur alır. Final incelemesi ancak her çekim denetlendiğinde tamamlanır. Eksik kare, denetçinin atladığı sonuç veya başarısız grup varsa incelenen/toplam kare sayısıyla (hiçbir grup başarılı değilse hata sebebiyle) beklemede kalır; önceki inceleme korunur ve aşama yeniden çalıştırılabilir.
- **Çok sayıda medya modeli, tek yönlendirici.** Ücretli çağrılar tek bir ağ geçidinden geçer: sağlayıcılar bölümün bütçe seviyesine göre kalite ve fiyatla sıralanır, istekler içerik hash'iyle önbelleğe alınır, bir sağlayıcı düşerse sıradakine geçilir. Bugün kullanılabilenler: fal (FLUX, Kontext, Seedream 4.5, Kling 3 / 2.6, MiniMax H3 Max Turbo, PixVerse V6, Vidu Q3 Turbo, Seedance 2), Gemini (Nano Banana görsel modelleri, TTS, isteğe bağlı Omni Flash video), ElevenLabs (ses, efekt, müzik) ve yerel ComfyUI. Para harcamadan sıralamayı görmek için: `pnpm ys plan`.
- **Önce maliyet.** Para harcanmadan önce tahmin gösterilir. İstekler içerik hash'iyle önbelleğe alınır, aynı istek iki kez ödenmez. Bölüm bütçe tavanı ücretli görsel, ses ve video API'leri içindir. Claude ajan çağrıları ayrıca gösterilir ve tavana sayılmaz.
- **Ajan başına model seçimi.** Stüdyo'nun **Modeller** sayfasından her ajanın hangi Claude modeliyle çalışacağını seçersin (ör. kalite kapısı için Haiku yerine Sonnet).
- **İki dilli Stüdyo.** Arayüz Türkçe ve İngilizce. Videolar ses sağlayıcısının desteklediği her dilde üretilebilir. Yabancı ad ve terimler anlatım dilini konuşanların söylediği gibi okunur: seslendirmeden önce yerleşik bir sözlük ve ucuz bir ajan bunları ses için okunuşa çevirir (Türkçe anlatım "C++"yı "ce artı artı" değil "si pılas pılas" diye söyler); altyazı özgün yazımı gösterir, dudaklar okunuşu izler. Türkçede sayılar rakamla yazılır ve kuralla okunur: "II. Mehmed" → "ikinci Mehmed", "1,5 milyon" → "bir buçuk milyon", "%75" → "yüzde yetmiş beş", "3/4" → "dörtte üç", "$1 milyarlık" → "bir milyar dolarlık", "1452–1481" → "… ile …", "vb." → "ve benzeri". Anlatıcının açarak söylediği kısaltmalar açılır, ek Türkçe kuralla yeniden kurulur: "TBMM'nin" → "Türkiye Büyük Millet Meclisi'nin", "ABD'ye" → "Amerika Birleşik Devletleri'ne", "BM'ye" → "Birleşmiş Milletler'e". Sözcük gibi söylenen kısaltmalar sözcük kalır, açılmaz ya da harflenmez: "COBOL" → "kobol", "NATO" → "nato".

## Gereksinimler

- Node.js 24 veya üstü ve pnpm 11
- FFmpeg (yerel render testi ve video klipleri için; `ffmpeg`/`ffprobe` PATH'te yoksa seslendirme süresi ve ses düzeyi Remotion'un kendi kopyasıyla ölçülür)
- Claude: oturum açılmış bir Claude Code kurulumu (abonelik) ya da `ANTHROPIC_API_KEY`
- İsteğe bağlı API anahtarları: fal, Gemini, ElevenLabs. Anahtarı olmayan sağlayıcı devre dışı kalır.
- İsteğe bağlı: formül ve grafik tahtaları için Manim 0.22 ve LaTeX (aşağıda); yoksa çekimler tahtasız çizilir.

## Kurulum

```bash
git clone https://github.com/ersinkoc/AI-Video-Factory.git
cd AI-Video-Factory
pnpm install
cp .env.example .env          # elindeki anahtarları doldur; boş olan sağlayıcılar devre dışı kalır
pnpm ys providers             # hangi sağlayıcılar etkin?
pnpm ys render-demo           # API'siz: yerel Remotion render testi
```

Docker'sız çalışır. Varlıklar `.data/assets`, maliyet defteri `.data/ledger.jsonl`, videolar `.data/episodes` altına yazılır. Bunların yerine Postgres 18, Redis 8 ve RustFS (S3) kullanmak için:

```bash
pnpm infra:up                 # portlar: 5433 (pg), 6380 (redis), 9000/9001 (rustfs)
pnpm db:migrate
pnpm test:integration
# .env: STORE=s3, LEDGER=db
```

### Manim tahtaları (isteğe bağlı)

Vektör bölümlerde yönetmen bir çekimin ortasındaki tahtaya formül ya da gerçek veriden grafik koyabilir. Kod bu tarifi
Manim sahnesine çevirir ve yerelde saydam klip olarak render eder (API yok, modelin yazdığı kod çalışmaz; LaTeX
matematik komutlarıyla sınırlı). Windows'ta kurulum:

```bash
python -m venv .data/tools/manim-venv
.data/tools/manim-venv/Scripts/python -m pip install manim==0.22.1
winget install --id MiKTeX.MiKTeX --scope user
# eksik LaTeX paketlerini MiKTeX kendisi indirsin:
"%LOCALAPPDATA%/Programs/MiKTeX/miktex/bin/x64/initexmf" --set-config-value=[MPM]AutoInstall=1
```

Başka konumlar: `YS_MANIM` (`manim` çalıştırılabilirinin yolu) ve `YS_LATEX_BIN` (LaTeX bin klasörü). Tahtalar
`library/math` altında önbelleğe alınır.

## Stüdyo (önerilen)

```bash
pnpm studio                   # geliştirme: http://localhost:3100
pnpm studio:build && pnpm studio:start   # production derlemesi, aynı port
```

1. **Yeni bölüm.** Üst menünün başındaki **Yeni bölüm** düğmesine tıkla; form tam genişlikte kendi sayfasında açılır. Konuyu gir; dili, süreyi, hareket modunu, çizgi stilini, sesi, bütçeyi, gerçeklik denetiminin açık olup olmayacağını ve altyazının videoya gömülüp gömülmeyeceğini seç. Her hareket modu kartı kendi tahmini maliyetini gösterir; sağdaki panel seçilen modu aşama aşama döker.
2. **Senaryo.** Sahneleri düzenle ve onayla.
3. **Konsept.** Karakterler ve mekânlar seçilip çizilir. Kalite kapısı paneli her çizimi referanslarıyla, puanlarıyla, kusurlarıyla ve çizim planıyla gösterir. Kabul et, reddet ya da notla yeniden çizdir.
4. **Üretim.** Pipeline şeridi, canlı panel ve etkinlik günlüğü her ajan çağrısını modeli, maliyeti ve süresiyle gösterir. Üretim render'dan önce durur ve onayını bekler: Çekimler sekmesi her çekimin önizleme karesini gösterir, *Onayla, render'a geç* hazır olduğunda render'ı başlatır (çekimleri yeniden oluşturmak onayı yeniden ister; yalnız altyazı, efekt ya da müzik değişirse sormadan yeniden render edilir). CLI bölümleri `--manual` ile açılmadıkça otomatik onaylıdır (`pnpm ys episode approve <id> preview`); vektör modunda bir çekimin karesi, nesnelerinin hepsi çizilir çizilmez gelir. Vektör bölümün bir kısmını render'dan önce ya da sonra değiştirmek için orada çekimleri seç (Shift ile aralık), ne değişsin yaz ("harita 1453'ü göstersin, Osmanlı ve Bizans vurgulu") ve *Yeniden oluştur*a bas: seçilen çekimlerin inceleme bulguları kendiliğinden eklenir, yani *Zayıfları seç* (puan 4 ve altı) ve *Yeniden oluştur* notsuz toplu düzeltir. Yönetmen yalnız o sahneleri yeniden planlar, yeni nesneler çizilir, video yeniden render edilir (sahne başına bir yönetmen çağrısı, çekimlerin şimdiki karelerini de görür; otomatik düzeltme turları atlanır, notunu geri almasınlar; yeniden planlanan sahneler ardından bir kez incelenir, yeni puanları görünür). Yalnız değişen sahneler yeniden render edilir: render sahne sahne saklanır, yarıda kalan render bitmiş sahnelerden devam eder.
5. **İzle ve indir:** videoyu, `.srt` altyazı dosyasını ve incelemesini gör. Altyazı her zaman videonun yanına `.srt` olarak yazılır; videoya gömülmesi bölüm başına bir anahtardır (değiştirmek yalnız render'ı tekrarlar, ücretsizdir).
 Yayın paketi YouTube başlığını, bölümlü açıklamayı, etiketleri (her birinin kopyala düğmesi var) ve indirilebilir 1280×720 küçük resmi verir. Yatay bölüm ayrıca dikey bir Short alır: paket en iyi 20–60 saniyesini seçer, yerelde 9:16 olarak yeniden render edilir.
6. **Sil.** Bölümler sayfasındaki her kartta, yarım kalmış ya da bitmiş fark etmeksizin, bir çöp kutusu düğmesi vardır. Önce sorar, sonra bölümün durumunu, videosunu, Short'unu, küçük resmini, altyazısını, render önbelleğini, inceleme karelerini, efekt ve müzik izlerini siler. Kütüphaneye onaylanmış çizimler, ortak üretim önbelleği ve harcama defteri kalır. İşi süren bölüm, iş durana kadar silinemez.

Ekran yazıları tek düzende: mekân, tarih ve olay satırları sol üstte sabit bir bilgi kartında, kişi etiketleri kişinin yanında; hepsi aynı yazı tipi ve plaka stiliyle. Kart bir yüzü, ad etiketini ya da bir ekranın veya panonun yazısını örtmez: üst köşelerde kişiler ya da bir pano varsa öbür köşeye ya da aralarındaki boşluğa geçer ve çekim boyunca o yerde kalır.

Diğer sayfalar:

- **Maliyetler:** harcama defteri.
- **Fiyatlar:** sağlayıcı fiyatları.
- **Dersler:** öğrenilmiş kural defteri.
- **Kurallar:** Stüdyo kuralları, kodun kullandığı aynı sabitlerden okunur.
- **Modeller:** her ajanın modeli.

Ağır işler Stüdyo sunucusunda değil, ayrı bir CLI sürecinde çalışır. Bu yüzden CLI'dan başlatılan çalıştırmalar da Stüdyo'da canlı görünür.

## CLI

```bash
pnpm ys episode new --topic "Osmanlı'da kahvehane yasakları" --lang tr --minutes 3 --motion vector --budget 5
pnpm ys episode run <id>                    # tüm aşamalar; hatadan sonra tekrar çalıştırınca kaldığı yerden devam eder
pnpm ys episode run <id> --until script     # yalnız hikâye + senaryo (görsel ve ses için para harcamaz)
pnpm ys episode run <id> --from keyframes   # bir aşamadan itibaren yeniden üretir
pnpm ys episode show <id>
pnpm ys cost --episode <id>
pnpm ys plan --cap i2v --duration 5         # para harcamadan sağlayıcı sıralaması
pnpm ys version
```

`episode new` için işe yarar seçenekler:

- `--motion animated|mixed|still|vector`
- `--style-pack auto|custom|<paket>` (liste: `pnpm ys styles`)
- `--line outline|flat|sketch|ink` (varsayılan: paketin çizgi stili)
- `--manual`: onaylarda durur.
- `--no-qa`: kare denetimini kapatır.
- `--no-realism`: gerçeklik denetimini kapatır.
- `--side-views`: yalnız vektör modunda. Yürüyen karakterlere ikinci, yandan bir çizim yapılır ve yürürken ona döner. Her biri bir tasarımcı çağrısı ve kapı denetimi tutar (~$0,15–0,35), kütüphanede saklanır.
- `--no-reverse-views`: yalnız vektör modunda. Varsayılan olarak altı ya da daha çok çekimde kullanılan odaya (en çok üç oda) bir kez ters açı çizilir (her biri ~$0,11, kütüphanede saklanır); bu bayrak kapatır.
- `--no-set-dressing`: yalnız vektör modunda. Varsayılan olarak her mekâna döneme uygun en çok iki büyük eşya bir kez çizilir (her biri ~$0,05, kütüphanede saklanır) ve o mekânın geniş ve orta çekimlerinde odanın dibine konur (kenarı hiçbir kişinin başının içinden ya da hemen yanından geçmez); bu bayrak kapatır.
- `--vertical`: 9:16 render eder.
- `--no-captions`: altyazıyı videoya gömmez (`.srt` yine yazılır).

Karakter bankası (vektör modu): onaylanan her karakter kütüphanede saklanır ve Stüdyo'nun **Karakterler** sayfasında görünür. Orada Claude'a konudan bağımsız bir karakter çizdirebilirsin (sunucu, bilim insanı, çocuk…; tanesi ~$0,15–0,35, kalite kapısından geçer) ve herhangi bir karakteri seri maskotu yapabilirsin. Bölüm açarken bankadan bir karakteri ekrandaki sunucu seçebilirsin (anlatımı o konuşur, çekimlerin çoğunda görünür) ya da kadroya ekleyebilirsin. Seçilenler yeniden çizilmez; bölüm onların stil paketine geçer. CLI: `pnpm ys bank [list|add|mascot]`, `episode new --presenter <kimlik> --with <kimlik,kimlik>`.

Hepsi için: `pnpm ys --help`.

## Yapılandırma

Anahtarlar ve ayarlar `.env` dosyasında durur (bkz. `.env.example`). Önemlileri:

| Değişken | Ne işe yarar |
|---|---|
| `FAL_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY` | Medya sağlayıcıları. Anahtar boşsa o sağlayıcı devre dışı kalır. |
| `ANTHROPIC_API_KEY` | Claude ajanları. Boşsa Claude Code girişi kullanılır. |
| `YS_MODEL_CREATIVE` / `_FAST` / `_CHEAP` | Her sınıfın varsayılan modeli. Modeller sayfasındaki ajan başına seçimler bunları ezer. |
| `STORE=s3`, `LEDGER=db` | Yerel dosyalar yerine S3 ve Postgres kullanır. |
| `GEMINI_OMNI_VIDEO=1` | Gemini Omni Flash videoyu açar (Veo'nun yerine; henüz gerçek çağrıyla doğrulanmadı). |
| `YS_UPDATE_CHECK=0` | Stüdyo'nun güncelleme kontrolünü kapatır. |
| `YS_RENDER_GL` | Render'da Chrome'un çizim arka ucu. Varsayılan `angle` (ekran kartı; yaklaşık %40 daha hızlı, 3D figürler için gerekli). `swangle`, ekran kartı olmayan makineler için yazılım GL'dir. Ekran kartıyla çöken render bir kez yazılım GL ile yeniden denenir. |
| `YS_BROWSER_EXECUTABLE` | Render, kare ve küçük resim için Remotion'ın indirdiği Chromium yerine kullanılacak Chrome ya da Chrome for Testing yolu. Boşsa Remotion'ınki. O Chromium'un açılışta askıda kaldığı sistemlerde gerekir (macOS 26.5: `browser has disconnected` / `Target closed`); render hatası bu durumda bu değişkeni işaret eder. |

## Sürümler ve güncelleme

Sürüm kök `package.json` dosyasındadır. Stüdyo başlığında görünür; `pnpm ys version` da gösterir.

Stüdyo 6 saatte bir GitHub'daki son release'e bakar. Daha yeni bir sürüm varsa sürüm notlarına bağlantı veren bir uyarı şeridi çıkar. Güncellemek için:

```bash
git pull && pnpm install && pnpm studio:build   # sonra pnpm studio:start ile yeniden başlat
```

Release çıkarmak için (bakımcılar):

```bash
pnpm release patch|minor|major              # sürüm artırma, CHANGELOG, commit ve etiket (yalnız yerelde)
pnpm release minor --publish                # ayrıca push eder ve GitHub release'i açar
pnpm release minor --dry-run                # notları önizler
```

Release betiği yalnız `main` dalında, commit edilmemiş değişiklik yokken, typecheck ve testler geçtikten sonra çalışır.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `pnpm studio` / `studio:build` / `studio:start` | Stüdyo, geliştirme ya da production modunda |
| `pnpm ys …` | CLI |
| `pnpm typecheck` | TypeScript 7 kontrolü |
| `pnpm test` | Birim testleri (Vitest) |
| `pnpm test:coverage` | Kapsamlı birim testleri; satır/dal/fonksiyon/ifade %100 altına düşerse başarısız |
| `pnpm test:integration` | Postgres ve RustFS testleri (Docker gerekir) |
| `pnpm release` | Sürüm artırma, değişiklik günlüğü ve etiket |
| `pnpm db:generate` / `db:migrate` | Drizzle migration'ları |
| `pnpm infra:up` / `infra:down` | Docker altyapısı |

## Lisans

[MIT](LICENSE) © 2026 Ersin KOÇ.

Üçüncü taraf parçalar kendi şartlarına tabidir. Özellikle render motoru [Remotion](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) bireyler, kâr amacı gütmeyen kuruluşlar ve en çok 3 çalışanlı şirketler için ücretsizdir; daha büyük şirketlerin Remotion şirket lisansı alması gerekir. Üretilen medya her sağlayıcının (fal, Google, ElevenLabs) şartlarına, referans görseller kendi Wikimedia lisanslarına tabidir.

## Depo yapısı

| Yol | İçerik |
|---|---|
| `packages/core` | Paylaşılan Zod şemaları, mikro-dolar para birimi, kalite kapısı kuralları, model rolleri, sürümler |
| `packages/media-gateway` | Her ücretli üretim çağrısı: maliyet ve kalite router'ı, önbellek, bütçe tavanı, yedek sağlayıcı |
| `packages/agents` | JSON şema çıktılı Claude Agent SDK ajanları |
| `packages/pipeline` | Bölüm durum makinesi ve aşamalar, referanslar, harita ve bayrak üretimi, tahminler |
| `packages/video` | Remotion kompozisyonları; vektör sahne çizicisi, PixiJS (WebGL) parçacık atmosferleri, gezegen ölçekli haritalar için three.js 3D küre, paper.js ile ölçülen çizerek belirme, GSAP kinetik yazı, Manim formül/grafik tahtaları, sentez arka plan müziği ve kareye kilitli efekt sesleri dahil |
| `packages/storage`, `packages/db` | Yerel ya da S3 varlık deposu; Postgres maliyet defteri |
| `apps/studio` | Next.js Stüdyo |
| `apps/cli` | `pnpm ys` |
| `apps/worker` | Trigger.dev task'ı (isteğe bağlı) |
