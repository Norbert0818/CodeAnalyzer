
# Hibás paraméterhasználati példák

## 1. Pontok (x, y) felcserélése

```cpp
// helyes
Point p1 = Point(10, 20);

// hibás (felcserélve a koordináták)
Point p2 = Point(20, 10);
```

Egy kétdimenziós pontnál szinte mindenki reflexből azt feltételezi, hogy először az x, utána az y koordináta jön. Ha ezt valaki véletlenül fordítva adja meg, a fordító semmit nem vesz észre, hiszen mindkettő egész szám. A program simán lefordul, csak a pont kerül rossz helyre a koordináta-rendszerben. Az ilyen hiba általában furcsa vizuális eltérésekben bukik ki – például grafikus programokban az objektum egyszerűen nem oda kerül, ahova szántuk.


## 2. Intervallum (begin–end) rossz sorrendben

```cpp
// helyes
Interval i1 = Interval(0, 100);

// hibás (end < begin)
Interval i2 = Interval(100, 0);
```

Egy intervallum megadásánál természetes elvárás, hogy a kezdőérték kisebb vagy egyenlő legyen a végértéknél (begin ≤ end). Ha ezt felcseréljük, az intervallum gyakorlatilag értelmét veszti, mert egy negatív hosszúságú tartományt kapunk. Bár típusszinten helyes számokat adtunk meg, logikailag hibás az egész. Ilyesmivel gyakran lehet találkozni időintervallumok kezelésénél (pl. a kezdési idő későbbi, mint a befejezés), vagy tömbszeletek használatakor, ahol egyszerűen érvénytelen lesz az indexelés (array[10:5]).

## 3. Két pont távolsága

```cpp
// helyes
double d1 = distance(x1, y1, x2, y2);

// hibás (felcserélt pontok)
double d2 = distance(x2, y2, x1, y1);
```

Első ránézésre egy két pont közti távolság számítása szimmetrikusnak tűnik – mindegy, melyiket adjuk meg előbb. Bizonyos megvalósításoknál viszont ez nem teljesen igaz. Ha a distance függvény például nemcsak a távolságot, hanem a vektor irányát is számolja, akkor a sorrend cseréje teljesen más eredményt ad. Ez tipikus „swapped arguments” hiba: mivel minden paraméter ugyanúgy double, a fordító boldogan lefordítja a kódot, de a futási eredmény már hibás lesz.

## 4. Felhasználói adatok hibás sorrendben

```cpp
// helyes
registerUser("John", "Doe", "john@example.com");

// hibás (név és email felcserélve)
registerUser("john@example.com", "Doe", "John");
```

A felhasználói adatok (név, vezetéknév, e-mail cím) jellemzően szöveges formátumban kerülnek átadásra. Ha ezek sorrendje felcserélődik, az adatok értelmezése teljesen elcsúszik: az e-mail cím bekerülhet a vezetéknév mezőbe, a vezetéknév a keresztnév helyére, és így tovább. Mivel minden mező string, a fordító semmit sem jelez. Az eredmény: hibás rekordok az adatbázisban, és egy felhasználói élmény, ami könnyen katasztrófába fordulhat (pl. rossz névvel küldött e-mail).

## 5. Fizikai mennyiségek felcserélése

```cpp
// helyes
setDimensions(width, height, depth);

// hibás (width és height felcserélve)
setDimensions(height, width, depth);
```

A fizikai paraméterek – mint a szélesség, magasság, mélység – tipikusan azonos típusú számok (például double vagy int). Ez a jelenség a primitive obsession nevű kód-szag példája, amikor túl sok primitív típust használunk strukturált adatok helyett. Ilyenkor könnyen előfordulhat, hogy véletlenül felcseréljük az argumentumokat, és a végeredmény teljesen eltorzul.
Egy 3D modell esetében például az objektum lapos vagy nyújtott lesz — elsőre talán csak furcsán néz ki, de a hiba valódi okát nem könnyű megtalálni. Az ilyen problémák alattomosak, mert futás közben semmilyen hibaüzenet nem jelzi, hogy valami nincs rendben.


## Linkek

https://hu.m.wikipedia.org/wiki/Ford%C3%ADt%C3%B3program
https://okt.inf.szte.hu/fordprog/
https://okt.inf.szte.hu/fordprog/eloadas/forditoprogramok.pdf
https://hu.m.wikipedia.org/wiki/K%C3%B3dfel%C3%BClvizsg%C3%A1lat
https://people.inf.elte.hu/groberto/elte_szt/eloadas_anyagok/elte_szt_ea09_dia.pdf
https://mik.uni-pannon.hu/docs/tananyagok/Gyimothy_Havasi_Kiss_Ford_progr.pdf


# Doksi kezdete

## 1. Bevezetés

A szoftverfejlesztésben az egyik legnagyobb kihívás, hogy a hibákat időben felismerjük és kijavítsuk. Minél hamarabb derül ki egy probléma, annál egyszerűbb és olcsóbb a megoldása. Sok hibát már a kód futtatása előtt is ki lehet szűrni, például a fordítóprogram vagy különböző statikus elemző eszközök segítségével.

A fordítóprogramok fő feladata, hogy a magas szintű nyelveken megírt forráskódot olyan formára alakítsák, amelyet a számítógép közvetlenül végre tud hajtani. Ez több lépésből áll: lexikális elemzés, szintaktikai elemzés, szemantikai ellenőrzés, majd a végső kód generálása. Ezek a lépések nemcsak a futtatható állomány előállítását szolgálják, hanem sok hibát automatikusan ki is szűrnek.

Nem minden probléma ilyen egyszerű. Vannak hibák – például a logikai hibák, a felcserélt paraméterek vagy a hibás típuskonverziók – amelyeket a fordító nem tud észrevenni. Ilyenkor jönnek képbe a statikus elemző eszközök, amelyek a kódot futtatás nélkül vizsgálják át, és olyan gyengeségeket is megtalálhatnak, amelyek egyébként csak futás közben bukkannának elő.

A dolgozat célja, hogy áttekintést adjon a fordítóprogramok működéséről és a statikus elemzés lehetőségeiről, majd ezekre építve bemutassa a paraméterfelcserélési hibák problémáját és a felismerésükre alkalmas megoldásokat.

## 2. Fordítóprogramok

A modern programozás elképzelhetetlen fordítóprogramok nélkül. Ezek azok az eszközök, amelyek a programozó által megírt kódot – például C-ben, C++-ban vagy Javában – olyan formára alakítják, amelyet a számítógép ténylegesen végre tud hajtani. Mivel a processzor csak gépi kódot ismer, szükség van egy köztes lépésre, ami a „magas szintű” emberi nyelvből lefordítja azt a gép nyelvére.

### 2.1 A fordítási folyamat főbb lépései

Egy fordító általában több, jól elkülöníthető fázisban dolgozik. Bár az implementációk részletei eltérhetnek, a logika hasonló:

1. Lexikális elemzés – A forráskódot kisebb darabokra bontja (tokenekre). Ezek lehetnek kulcsszavak, változónevek, számok vagy jelek. Ha a programozó véletlenül elgépel valamit, itt derül ki, hogy érvénytelen karaktert használt.

2. Szintaktikai elemzés (parsing) – A fordító ellenőrzi, hogy a tokenek megfelelnek-e a nyelv nyelvtani szabályainak. Ebben a szakaszban készül el egy szintaxisfa, ami a program logikai szerkezetét írja le. Tipikus hibák itt: hiányzó zárójelek vagy rosszul lezárt utasítások.

3. Szemantikai elemzés – Itt már nem a szerkezetet, hanem a jelentést vizsgálja a fordító. Például kiszűri, ha egy változót inicializálás nélkül használunk, vagy ha két eltérő típusú értéket próbálunk összeadni.

4. Köztes kód és optimalizáció – A legtöbb modern fordító nem közvetlenül gépi kódot állít elő, hanem először köztes formátumot. Ez független a célhardvertől, és könnyebb rajta optimalizációkat végezni, például gyorsabb futás vagy kisebb memóriahasználat érdekében.

5. Kódgenerálás – Az utolsó lépésben születik meg a gépi kód, vagyis a futtatható állomány, amit az operációs rendszer és a processzor közvetlenül ért.

### 2.2 Fordító és értelmező

Nem minden nyelv használ klasszikus fordítót. Az értelmezők (interpreters) például utasításonként hajtják végre a forráskódot fordítás nélkül. A Python vagy a JavaScript tipikusan így működik.
Léteznek hibrid megoldások is: a Java például először bájtkódra fordítja a programot, majd ezt egy virtuális gép futtatja. Ez a megközelítés előnyt ad a hordozhatóságban, mert ugyanaz a kód többféle platformon is futhat.

### 2.3 Hibakezelés a fordítás során

A fordító egyik legfontosabb feladata, hogy visszajelezzen a hibákról.
- Lexikális hiba: például egy ismeretlen karakter használata
- Szintaktikai hiba: ilyen lehet egy hiányzó pontosvessző vagy egy rosszul lezárt ciklus
- Szemantikai hiba: például amikor két eltérő típusú változót próbálunk összeadni, vagy rossz paramétert adunk egy függvénynek

A gond ott kezdődik, hogy nem minden hibát tud jelezni a fordító. Egy logikai hiba – például ha két értéket rossz sorrendben adunk át – lehet teljesen „legális” a fordító szemében, de futás közben teljesen mást eredményez.

### 2.4 Példák fordítóprogramokra

A legismertebb fordítók közé tartozik a GCC (GNU Compiler Collection), amely számos nyelvet támogat. Széles körben használt még a Clang, amely az LLVM keretrendszerre épül. Ezek nemcsak fordításra alkalmasak, hanem kiterjedt elemzési és optimalizációs lehetőségeket is biztosítanak. Nem véletlen, hogy sok modern statikus kódelemző eszköz is ezekre épít.

## 3. Kódfelülvizsgálat és hibadetektálás

A szoftverek minősége nem csak a funkciók helyes megvalósításán múlik, hanem azon is, mennyire sikerül időben kiszűrni a hibákat. Bár a fordítóprogramok sok alapszintű hibát jeleznek, számos probléma csak akkor derül ki, ha valaki külön ránéz a kódra, vagy speciális elemző eszközt használ. Erre szolgál a kódfelülvizsgálat (code review) és a különféle hibadetektálási technikák.

### 3.1 Kódfelülvizsgálat fogalma és szerepe

A kódfelülvizsgálat során egy fejlesztő (vagy több) átnézi a másik által írt kódot, még mielőtt az bekerül a végleges rendszerbe. Ennek nem csak az a célja, hogy hibákat találjon, hanem az is, hogy a kód olvashatóbb, egységesebb és karbantarthatóbb legyen. Egy jól átgondolt kód később könnyebben bővíthető, és kevésbé hajlamos hibákra.

Ráadásul a code review egyben tudásmegosztás is: a csapat tagjai látják, mások hogyan oldanak meg feladatokat, és tanulhatnak belőle.

### 3.2 Manuális és automatikus módszerek

A kódfelülvizsgálat kétféle módon történhet:

- Manuális átnézés – a fejlesztők ténylegesen olvassák és értékelik a kódot. Ez lehet formális (előre megadott szempontok alapján) vagy informális, amikor csak egyszerűen „rápillantunk” a kolléga munkájára.

- Automatizált ellenőrzés – különféle eszközök (pl. lintelők, statikus elemzők) automatikusan keresik a hibákat, rossz kódmintákat vagy a stílustól eltérő megoldásokat. Ezek nem helyettesítik a manuális áttekintést, de sok triviális hibát ki tudnak szűrni.

### 3.3 Hibák típusai

A hibákat több szempont szerint lehet csoportosítani:

- Szintaktikai hibák – ezeket a fordító maga jelzi (például hiányzó zárójel vagy pontosvessző).

- Szemantikai hibák – a kód fut ugyan, de jelentésében hibás (pl. nem inicializált változó használata).

- Logikai hibák – ezek a legkellemetlenebbek, mert a program fut és eredményt is ad, de az nem az, amit vártunk (például egy rosszul megadott feltétel egy ciklusban).

- Stílusbeli hibák – nem feltétlenül rontják el a működést, de megnehezítik az olvasást és karbantartást.

### 3.4 Hibadetektáló technikák

A hibák felkutatására többféle technika létezik:

1. Tesztelés – a kódot előre megírt tesztesetekkel futtatjuk, hogy kiderüljön, helyesen működik-e. A gond az, hogy csak az derül ki, amit ténylegesen leteszteltünk.

2. Dinamikus elemzés – a program futása közben vizsgáljuk annak működését. Például memóriahasználat, túlcsordulások vagy szivárgások így könnyebben észrevehetők.

3. Statikus elemzés – itt a kódot lefuttatás nélkül vizsgáljuk. Ez sok olyan problémát előre jelezhet, amit a tesztelés nem feltétlenül fedne le (pl. felesleges változók, gyanús paraméterhasználatok).

### 3.5 Miért jó a kódfelülvizsgálat?

A rendszeres kódfelülvizsgálat több szempontból is hasznos:

- A hibák olcsóbban javíthatók, ha még a fejlesztés közben derülnek ki, nem a kiadás után

- Javul a kód minősége és biztonsága

- A csapaton belül nő a tudásmegosztás, hiszen mindenki látja, más hogyan gondolkodik

## 4. Statikus kódelemzés

A hibák kiszűrésének egyik leghatékonyabb eszköze a statikus kódelemzés. Ez alatt azt értjük, hogy a program forráskódját még futtatás előtt, „álló helyzetben” vizsgáljuk át. Ez nagy különbség a dinamikus elemzéshez vagy a teszteléshez képest, ahol a programot ténylegesen futtatni kell ahhoz, hogy kiderüljön, mi történik.

A statikus kódelemzés abban segít, hogy olyan hibákat is felfedezzünk, amelyek a fordítón „átcsúsznak”. Mivel a mai programok egyre nagyobbak és bonyolultabbak, az ilyen elemző eszközök használata mára szinte alapkövetelmény lett, főleg iparágakban, ahol a hibák komoly következményekkel járhatnak (például autóipar, egészségügyi szoftverek).


### 4.1 A statikus kódelemzés alapjai

Az elemzés több szinten is képes dolgozni:

- Lexikai szinten – karakterek, változónevek, literálok helyes használata

- Szintaktikai szinten – megfelel-e a kód a nyelv nyelvtanának

- Szemantikai szinten – például kompatibilisek-e a típusok, inicializáltunk-e minden változót

- Strukturális szinten – milyen a program felépítése, hogyan hívják egymást a függvények, vannak-e felesleges vagy elérhetetlen kódrészek

Ezek kombinációja adja azt a képet, ami alapján az elemző meg tudja mondani, hol lehet baj.

### 4.2 Milyen hibák azonosíthatók?

Néhány tipikus példa:

- Memóriakezelési hibák – pl. lefoglalt, de el nem engedett memória (memory leak), vagy rossz mutatóhasználat

- Típushibák – amikor összekeverünk különböző típusokat, vagy hibás konverziót végzünk

- Elérhetetlen kód – olyan részek, amelyek sosem fognak lefutni

- Paraméterkezelési hibák – például ha rossz sorrendben adjuk át a paramétereket

- Biztonsági problémák – például bemeneti adatok helytelen kezelése, ami buffer túlcsorduláshoz vezethet

### 4.3 Eszközök és technológiák

Számos eszköz áll rendelkezésre, nyílt forráskódúak és kereskedelmi megoldások egyaránt:

- Clang-Tidy – C/C++ kódhoz, szabályok alapján ellenőriz és figyelmeztet

- SonarQube – sok nyelvet támogat, és nem csak hibákat keres, hanem metrikákat is számol, hogy lássuk, mennyire „egészséges” a kód

- Coverity – ipari szinten használt, különösen erős a biztonsági rések felismerésében

- PMD és FindBugs – Java fejlesztésnél gyakran alkalmazott eszközök

### 4.4 Miért hasznos?


- Korán jelez: már a fejlesztés elején kiszűri a hibákat

- Pénzt spórol: olcsóbb a fejlesztés közben javítani, mint éles rendszerben

- Biztonságot ad: előbb derülnek ki a kritikus hibák

- Szebb kódot eredményez: egységesebb, könnyebben olvasható programot kapunk

### 4.5 A statikus elemzés korlátai

Fontos azonban kiemelni, hogy a statikus kódelemzés sem tökéletes módszer. Korlátai közé tartozik:

- Sokszor ad hamis pozitív találatot, vagyis hibát jelez ott is, ahol nincs.

- Vannak hibák, amelyeket egyszerűen nem tud kimutatni (pl. bizonyos logikai hibák).

- Nagy projekteknél előfordulhat, hogy az elemzés lassú és sok erőforrást igényel.

- A talált hibákat a fejlesztőnek kell értelmeznie: az eszköz csak figyelmeztet, de nem mondja meg biztosan, mi a helyes megoldás.

## 5. Átvezetés a konkrét problémára

A programozás során sokszor találkozni olyan hibákkal, amelyeket a fordító vagy az elemző eszközök nem képesek észrevenni, mert a kód formailag hibátlan. Ezek a hibák nem a nyelvtannal vagy a típusrendszerrel kapcsolatosak, hanem a program logikájával. Ilyen például, amikor egy függvény paramétereit véletlenül rossz sorrendben adjuk meg.

A paraméterfelcserélés (angolul swapped arguments) kifejezetten alattomos hiba: a fordító gond nélkül lefordítja a kódot, hiszen a típusok megfelelnek, viszont a futási eredmény már nem az lesz, amit várunk. Különösen veszélyes ez olyan esetekben, amikor a függvény több, azonos típusú paramétert kap – például int, float vagy string értékeket.

Egy gyakori példa erre, ha egy pont koordinátáit fordított sorrendben adjuk meg, vagy ha egy függvény, amely egy téglalap szélességét és magasságát várja, a két értéket véletlenül felcserélve kapja meg. A program futni fog, de az eredmény teljesen torz lehet.

A hibát az is súlyosbítja, hogy sok esetben nehéz észrevenni: a kód lefordul, nem dob kivételt, a program látszólag működik, csak épp a logikai eredmény hibás. A hiba gyakran csak akkor derül ki, amikor a végeredmény „furán” néz ki, vagy valamilyen adat nem oda kerül, ahová kellene.

## 6. Modern fejlesztői környezetek és a Language Server Protocol (LSP)

A 4. fejezetben látott statikus elemző eszközök (mint a Clang-Tidy) rendkívül hasznosak, de felmerül a kérdés: hogyan kerülnek ezeknek az eszközöknek az eredményei a szemünk elé, miközben gépelünk? Miért húzza alá a Visual Studio Code vagy más modern szerkesztő szinte azonnal pirossal a hibás kódot?

A válasz a **Language Server Protocol (LSP)**.

### 6.1 A probléma, amit az LSP megold: Az "$M \times N$" probléma

A modern szoftverfejlesztésben rengeteg programozási nyelv ($M$ db) és rengeteg kódszerkesztő ($N$ db) létezik.
- Nyelvek ($M$): C++, Python, Java, JavaScript, Rust, Go...
- Szerkesztők ($N$): Visual Studio Code, Sublime Text, Vim, Eclipse, Atom...

Régebben, ha a Vim fejlesztői akartak egy jó C++ kódkiegészítést, meg kellett írniuk. Ha az Eclipse fejlesztői akarták ugyanezt, nekik is meg kellett írniuk. Aztán mindezt elölről a Python nyelvhez, és így tovább. Ez $M \times N$ mennyiségű munkát jelentett, ami óriási erőforrás-pazarlás volt.

### 6.2 Az LSP megoldása: A kliens és a szerver szétválasztása

Az LSP egy egyszerű, de zseniális ötleten alapul: válasszuk szét a "buta" szerkesztőt (a klienst) az "okos" nyelvi elemzőtől (a szervertől).

Ahelyett, hogy minden szerkesztő saját elemzőt írna, elég egyetlen "nyelvi szervert" írni egy adott nyelvhez (pl. clangd a C++-hoz, Pylance a Pythonhoz). Ezután bármelyik szerkesztő, amelyik "beszéli" az LSP protokollt, képes kommunikálni ezzel az egyetlen szerverrel.

Ezzel az $M \times N$ probléma $M + N$ problémára egyszerűsödik.

### 6.3 Hogyan működik a gyakorlatban?

Az LSP egy szabványosított kommunikációs protokoll (JSON-RPC alapokon). A kommunikáció a háttérben zajlik:
1. A Kliens (pl. VS Code) üzenetet küld: "A felhasználó az main.cpp fájl 10. sorának 15. karakterén áll, és az egeret fölötte tartja."
2. A Szerver (pl. clangd) elemzi a kódot és válaszol: "Azon a pozíción a setDimensions függvény hívása található. Ennek a szignatúrája: void setDimensions(int width, int height, int depth). Itt a hozzá tartozó dokumentáció..."
3. A Kliens (VS Code) megjeleníti ezt az információt egy kis felugró ablakban.

Ugyanez a mechanizmus működik minden más funkciónál is:
- **Definícióra ugrás** (textDocument/definition): A kliens kéri a pozíciót, a szerver visszaadja a definíció helyét.
- **Hibajelzés** (textDocument/publishDiagnostics): A szerver (miután a háttérben lefuttatta az elemzést, pl. a Clang-Tidy-t) magától küld egy üzenetet a kliensnek: "Figyelem, a 15. sorban találtam egy hibát. Húzd alá pirossal, és írd ki ezt az üzenetet: 'Túl kevés argumentumot adtál meg'."

### 6.4 Az LSP korlátai: Az analitikai "fekete doboz"

Az LSP fantasztikus eszköz arra, hogy a meglévő statikus analízisek eredményeit interaktívan, valós időben megjelenítse a fejlesztőnek.

Van azonban egy kulcsfontosságú korlátja: az LSP egy "**fekete doboz**".

A kliens (a szerkesztő) nem lát bele abba, hogy a szerver hogyan végzi az elemzést. A szerver nem küldi el a kliensnek a teljes Absztrakt Szintaxis Fát (AST-t) vagy a típusinformációkat. A protokoll szándékosan elrejti ezt a komplexitást. Az LSP csak egyszerű, szerkesztő-szintű fogalmakat ismer: "pozíció", "aláhúzás", "szöveg".

Ez azt jelenti, hogy ha egy teljesen új, egyedi statikus elemzést akarunk írni – mint például a jelen dolgozat célja, a felcserélt függvényargumentumok detektálása –, akkor az LSP-t önmagában nem használhatjuk.

Az LSP nem az analízis elvégzésére szolgáló keretrendszer, hanem az analízis eredményeinek kézbesítésére szolgáló protokoll. Ahhoz, hogy a felcserélt argumentumokat felismerjük, szükségünk van a kód mély szemantikai reprezentációjára (az AST-re), amit csak a fordítóprogram belső rétegei biztosítanak.

Ezért van az, hogy bár a modern fejlesztői élményt az LSP adja, egy új analitikai algoritmus kifejlesztéséhez mélyebbre kell ásnunk: közvetlenül a fordítóprogram infrastruktúrájához, mint például a Clang LibTooling és a Clang-Tidy keretrendszer.


## 7 A választott megoldás: A Clang-Tidy keretrendszer


Miután az 5. fejezetben megállapítottuk, hogy a felcserélt argumentumok problémája egy mély szemantikai hiba, és a 6. fejezetben láttuk, hogy az LSP "csak" egy prezentációs réteg, egyértelművé válik, hogy egy robusztus megoldáshoz magához a fordítóprogram belső adatstruktúráihoz kell hozzáférnünk.

A dolgozat céljának eléréséhez – egy egyedi, szemantikai alapú hibakereső implementálásához C++ kódra – a Clang-Tidy keretrendszert választottuk.

### 7.1 Mi az a Clang-Tidy?

A Clang-Tidy egy "linter" eszköz a C, C++ és Objective-C nyelvekhez. Az LLVM projekt része, és közvetlenül a Clang fordítóprogram-infrastruktúrára épül. Célja, hogy diagnosztizáljon és esetenként automatikusan ki is javítson tipikus programozási hibákat, stílusbeli vétségeket, vagy "bug-prone" (hibára hajlamos) kódmintázatokat – mint amilyen a felcserélt argumentumok esete is.

A Clang-Tidy nem egy monolitikus program, hanem egy **bővíthető keretrendszer**. Egy "check" (ellenőrzés) gyűjteményből áll, és ami a legfontosabb: lehetővé teszi a fejlesztők számára, hogy saját, egyedi ellenőrzéseket írjanak és integráljanak a rendszerbe.

### 7.2 A kulcs: Hozzáférés az Absztrakt Szintaxis Fához (AST)

A Clang-Tidy (és az alapjául szolgáló **LibTooling** könyvtár) messze felülmúlja az egyszerű, reguláris kifejezéseken alapuló elemzőket. Míg egy regex-alapú kereső csak szöveget lát (pl. a "setDimensions(height, width, depth)" karaktersorozatot), addig a Clang-Tidy a fordító által felépített A**bsztrakt Szintaxis Fát (AST)** látja.

Az AST a program kódjának fa-struktúrájú, szemantikai reprezentációja. Amikor a Clang-Tidy ezt a kódot elemzi, nem stringekkel dolgozik, hanem ilyen csomópontokkal:
- *CallExpr* (Függvényhívás):
  - Hívott függvény neve: *setDimensions*
  - Argumentum 0: *DeclRefExpr* (Változóra hivatkozás) -> neve: *height*
  - Argumentum 1: *DeclRefExpr* (Változóra hivatkozás) -> neve: *width*
  - Argumentum 2: *DeclRefExpr* (Változóra hivatkozás) -> neve: *depth*

Ebben a struktúrában az elemző pontosan tudja, hogy a *height* egy változó, és az a hívás első argumentuma.

### 7.3 Egyedi ellenőrzés írása: AST Matchers

A Clang-Tidy leghatékonyabb eszköze az egyedi ellenőrzések írására az **AST Matchers** (AST-egyeztetők) könyvtára. Ez egy deklaratív API, amely lehetővé teszi, hogy "lekérdezéseket" fogalmazzunk meg az AST-re anélkül, hogy manuálisan kellene bejárnunk a teljes fát.

Ahelyett, hogy bonyolult C++ kódot írnánk a fa bejárására, egyszerűen leírjuk, hogy *mit keresünk*. A mi "swapped arguments" problémánkra egy egyeztető például így nézhet ki (szemléltetésképpen):

```cpp
// Egy AST Matcher, ami megtalálja a függvényhívásokat,
// ahol az argumentumok nevei gyanúsan fel vannak cserélve
callExpr(
  // Csak azokat a hívásokat nézzük, amelyeknek van definíciója
  callee(functionDecl().bind("funcDef")),
  
  // Amelynek legalább két argumentuma van
  hasArgument(0, expr().bind("arg0")),
  hasArgument(1, expr().bind("arg1"))
  
).bind("theCall");
```

Amikor az elemzőnk talál egy ilyen *callExpr* (függvényhívás) csomópontot, lefut a C++ kódunk. Ebben a kódban már közvetlenül hozzáférünk a "megkötött" (*bind*) csomópontokhoz:
    1. *theCall*: Maga a függvényhívás.
    2. *funcDef*: A hívott függvény definíciója. Ebből kiolvashatjuk a paraméterek neveit (pl. *ParmVarDecl* csomópontok: *width*, *height*).
    3. *arg0*, *arg1*: A hívás helyén megadott argumentumok (pl. *DeclRefExpr* csomópontok: *height*, *width*).

Innenál kezdve a heurisztika implementálása már egyszerű: összehasonlítjuk az argumentumneveket (*arg0.name*, *arg1.name*) a paraméternevekkel (*funcDef.param[0].name*, *funcDef.param[1].name*), és ha egyezést, de rossz sorrendet találunk, hibát jelezhetünk.

### 7.4 Összegzés: Miért a Clang-Tidy?

A Clang-Tidy választása biztosítja, hogy az elemzésünk robusztus legyen.

- Pontos: Nem tévesztik meg a kommentek, a makrók vagy a komplex típusnevek, mert az AST már egy "tiszta", szemantikai fa.
- Kontextus-érzékeny: Az elemző pontosan ismeri a típusokat. Tudja, hogy a *setDimensions(10, 20, 30)* hívásnál nincs mit összehasonlítani (mert azok literálok), de a *setDimensions(height, width, depth)* hívásnál már van.
- Bővíthető: Ez a dolgozat a felcserélt argumentumokra fókuszál, de a Clang-Tidy keretrendszer lehetővé teszi tetszőleges más, egyedi szemantikai ellenőrzés hozzáadását a jövőben.


