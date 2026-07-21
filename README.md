# 🧘 ComfyUI-Dehypnotic Node Pack

En samling avanserte, fleksible og produksjonsklare custom nodes for **ComfyUI**. Pakken inneholder verktøy for trådløs kabling, avansert bildeforholds- og oppløsningsberegning, interaktiv tekstbehandling samt kraftige lagringsnoder for bilder, video og lyd.

---

## 📋 Oversikt over nodene

| Node Display Name | Kategori | Beskrivelse |
| :--- | :--- | :--- |
| **🧘 AspectRatio (Dehypnotic)** (`AspectRatioAdvancedV2`) | `Dehypnotic/📐 Aspect Ratio` | Beregn ideelle bildedimensjoner, skaler bilder og utfør VAE-encoding direkte. |
| **🧘 RangeToString (Dehypnotic)** (`RangeToString`) | `Dehypnotic/📝 Text Utils` | Generer en tallsekvens/tallrekke som en formatert tekststreng. |
| **🧘 Set Dehypnotic** (`DehypnoticSetNode`) | `Dehypnotic/🔀 Wireless Links` | Lagre hvilken som helst variabel eller datastrøm trådløst under et gitt navn. |
| **🧘 Get Dehypnotic** (`DehypnoticGetNode`) | `Dehypnotic/🔀 Wireless Links` | Hent ut igjen trådløse data fra en `Set Dehypnotic`-node hvor som helst i workflowen. |
| **🧘 Save MP3 (Dehypnotic)** (`SaveAudioMP3`) | `Dehypnotic/💾 IO` | Lagre lydspor til disk i MP3-format med VBR/CBR/ABR-støtte og variabel-maler. |
| **🧘 Save Images (Dehypnotic)** (`SaveImages`) | `Dehypnotic/💾 IO` | Ekporter bilder i PNG, JPG, WEBP, GIF, BMP, TIFF med workflow-embedding og sekvensering. |
| **🧘 Save Video & Frames (Dehypnotic)** (`SaveVideo`) | `Dehypnotic/💾 IO` | Eksporter video og/eller bilderammer (H.264, HEVC, VP9, AV1, ProRes, DNxHR) med lyd. |
| **🧘 NumberedText (Dehypnotic)** (`NumberedText`) | `Dehypnotic/📝 Text Utils` | Interaktiv, nummerert tekstbehandler med avmerkingsbokser for selektiv prompt-sammenslåing. |

---

## 📐 AspectRatioAdvancedV2 (`🧘 AspectRatio (Dehypnotic)`)

**Kategori:** `Dehypnotic/📐 Aspect Ratio`

En alt-i-én oppløsningsberegner og bildebehandler for ComfyUI. Noden gjør det enkelt å velge bildeforhold (aspect ratio) eller dimensjoner, avrunde til nærmeste mod-størrelse (snap), samt automatisk skalere og VAE-encode bilder til latent-rommet.

### 🌟 Hovedfunksjoner
* **Tre beregningsmoduser:**
  * **Presets:** Velg fra forhåndsdefinerte bildeforhold (1:1, 16:9, 3:2, 4:3, etc.). Noden har 3 tilpassbare hurtigknapper (**dobbelklikk** på dem i grensesnittet for å lagre dine egne favorittforhold).
  * **Custom Ratio:** Angi eget brøkforhold (f.eks. 21:9) eller hent bildeforholdet direkte fra et innkommende referansebilde.
  * **Custom Dimensions:** Angi spesifikk bredde og høyde manuelt, eller hent de eksakte dimensjonene direkte fra et innkommende bilde.
* **Beregningstyper (`calc_mode`):**
  * `min`: Setter minste side til den angitte target-oppløsningen.
  * `max`: Setter største side til den angitte target-oppløsningen.
  * `megapixels`: Beregner bredde og høyde slik at det samlede pikselantallet matcher målet i megapiksler (f.eks. 1.0 MP).
* **Snap / Grid-justering:** Runder av bredde og høyde til nærmeste multiplum av `8`, `16`, `32` eller `64` piksler (viktig for SD1.5, SDXL, FLUX osv.).
* **Integrert bildeskalering:** Kan automatisk skalere et innkommende bilde til den beregnede oppløsningen med valgfri metode (`auto`, `lanczos`, `bicubic`, `bilinear`, `nearest exact`, `area`). `auto` velger automatisk Lanczos ved nedskalering for maksimal skarphet, og Bicubic ved oppskalering.
* **Integrert VAE Encoding:** Kan VAE-encode det skalerte bildet direkte, ideelt for Image-to-Image (I2I) og inpainting workflows.

### 📥 Inputs
* **Innganger (Valgfrie):**
  * `image` (`IMAGE`): Valgfritt bilde som brukes som oppløsnings-referanse og/eller som kilde for bildeskalering/encoding.
  * `vae` (`VAE`): Valgfri VAE-modell for direkte latent-encoding.

### 📤 Outputs
* `width` (`INT`): Den beregnede og avrundede bredden i piksler.
* `height` (`INT`): Den beregnede og avrundede høyden i piksler.
* `latent` (`LATENT`): Tom latent (hvis intet bilde/VAE er kablet inn) eller VAE-kodet latent fra det skalerte bildet.
* `scaled_image` (`IMAGE`): Det skalerte (eller originale) bildet.

---

## 📝 RangeToString (`🧘 RangeToString (Dehypnotic)`)

**Kategori:** `Dehypnotic/📝 Text Utils`

Genererer en sekvens av tall formatert som en enkelt tekststreng (STRING). Nyttig for å lage lister, indeks-strenger eller parametere for animasjoner og looper.

### 🌟 Hovedfunksjoner
* Støtter både økende (`step > 0`) og minkende (`step < 0`) sekvenser.
* Valgfri inkludering av sluttverdi via `inclusive` eller `exclusive` modus.
* Valgfritt skilletegn / separator (komma, linjeskift `\n`, mellomrom, etc.).

### 📥 Inputs
* `start` (`INT`, standard: `0`): Startverdi for sekvensen.
* `end` (`INT`, standard: `3`): Sluttverdi for sekvensen.
* `step` (`INT`, standard: `1`): Steglengde (kan være negativ).
* `separator` (`STRING`, standard: `,`): Skilletegn mellom tallene.
* `mode` (`"inclusive"` / `"exclusive"`): Om `end`-verdien skal inkluderes dersom den treffes av steget.

### 📤 Outputs
* `STRING`: Den genererte tallsekvensen satt sammen med skilletegnet (f.eks. `"0,1,2,3"`).

---

## 🔀 Set Dehypnotic & Get Dehypnotic (`🧘 Set Dehypnotic` / `🧘 Get Dehypnotic`)

**Kategori:** `Dehypnotic/🔀 Wireless Links`

Trådløse koblingsnoder (Wireless Nodes) som lar deg sende hvilken som helst datatype overalt i workflowen din uten å trekke lange, rotete ledninger ("spaghetti").

### 🌟 Hovedfunksjoner
* **Universelle datatyper (`ANY`):** Støtter kobling av bilder (`IMAGE`), latenter (`LATENT`), modeller (`MODEL`), VAE, CLIP, tekst (`STRING`), tall (`INT`/`FLOAT`) og tilpassede datatyper.
* **Passthrough på Set:** `Set Dehypnotic`-noden har også en direkte utgang (`*`) slik at du kan koble den videre lokalt samtidig som den er tilgjengelig trådløst.
* **Frontend Virtual Execution:** Kjører som virtuelle noder i ComfyUI sitt grensesnitt uten å legge til forsinkelse eller ekstra steg under selve kjøringen.

### 💡 Bruk
1. Plasser en **Set Dehypnotic**-node der du har et signal du vil gjenbruke.
2. Koble signalet til `value`-inngangen, og gi variabelen et lettgjenkjennelig navn i `name`-feltet.
3. Plasser en **Get Dehypnotic**-node et annet sted i canvaset, og velg variabelnavnet fra rullgardinmenyen.

---

## 💾 SaveAudioMP3 (`🧘 Save MP3 (Dehypnotic)`)

**Kategori:** `Dehypnotic/💾 IO`

Ekstraherer og lagrer lydspor fra ComfyUI til disk i komprimert MP3-format med høy kvalitet og full fleksibilitet.

### 🌟 Hovedfunksjoner
* **Automatisk format-håndtering:** Håndterer mono og stereo, varierte sample rates (SR) og batch-dimensjoner automatisk.
* **Encoding-backends:** Benytter FFmpeg (automatisk nedlastet/bundlet via `imageio-ffmpeg` eller systemets FFmpeg) med fallback til `lameenc`.
* **Bitrate-moduser:**
  * `variable` (VBR): Dynamisk bitrate basert på kvalitet (`high` ~245 kbps V0, `medium` ~165 kbps V4, `low` ~100 kbps V7).
  * `constant` (CBR): Fast bitrate (`high` 320 kbps, `medium` 192 kbps, `low` 128 kbps).
  * `average` (ABR): Gjennomsnittlig bitrate (`high` 256 kbps, `medium` 192 kbps, `low` 160 kbps).
* **Dynamiske banemaler:** Støtter variabler som `[date]`, `[datetime]`, `[unix]`, `[guid]`, `[model]` og `[time(%Y-%m-%d)]` i stier og filnavn.
* **Sikkerhetskontroll:** Støtter whitelisting for lagring utenfor ComfyUI sin standard output-mappe.

### 📥 Inputs
* `audio` (`AUDIO`): Lydsignalet fra en lydgenererende node.
* `file_path` (`STRING`, standard: `"audio"`): Mappe hvor lydfilen skal lagres.
* `date_subfolder_pattern` (`STRING`, standard: `"%Y-%m-%d"`): Mønster for undermapper basert på dato/tid.
* `filename_prefix` (`STRING`, standard: `"ComfyUI"`): Filnavn-prefix.
* `bitrate_mode` (`"variable"` / `"constant"` / `"average"`): Modus for MP3-bitrate.
* `quality` (`"high"` / `"medium"` / `"low"`): Kvalitetsnivå.

### 📤 Outputs
* `audio` (`AUDIO`): Passthrough av lydsignalet.
* `bitrate_info` (`STRING`): Tekstlig oppsummering av valgte bitrate-innstillinger.

---

## 💾 SaveImages (`🧘 Save Images (Dehypnotic)`)

**Kategori:** `Dehypnotic/💾 IO`

En avansert bilde-eksportør med støtte for mange bildeformater, sekvensiell navngivning, bildeoptimalisering og innbygging av workflow-metadata.

### 🌟 Hovedfunksjoner
* **Støttede bildeformater:** PNG, JPG/JPEG, WEBP, GIF, BMP, TIFF.
* **Automatisk sekvensiering:** Teller opp filnavn fortløpende (`prefix_0001.png`, `prefix_0002.png`) med tilpassbar sifferlengde (`number_padding`) og skilletegn (`filename_delimiter`).
* **Kvalitetsstyring:**
  * Justerbar kvalitet (`quality` 1–100) for JPG/WEBP.
  * Tapfri WEBP-støtte (`lossless_webp`).
  * Bildeoptimalisering via Pillow (`optimize_image`).
  * DPI-angivelse (standard 300 DPI).
* **Workflow Embedding:** Inkluderer hele ComfyUI-workflowen direkte i bildets metadata (tEXt/iTXt for PNG, XMP for WEBP), slik at bilder kan dras rett inn i ComfyUI igjen senere.
* **Dynamiske banemaler:** Full støtte for plassholdere som `[date]`, `[datetime]`, `[unix]`, `[guid]`, `[model]` og `[env(NAVN)]`.

### 📥 Inputs
* `images` (`IMAGE`): Bilde(r) eller bildeserie.
* `file_path` (`STRING`): Relativ eller absolutt sti.
* `date_subfolder_pattern` (`STRING`): Mønster for dato-undermappe.
* `filename_prefix` (`STRING`, standard: `"QIE"`): Prefiks for filnavn.
* `filename_delimiter` (`STRING`, standard: `"_"`): Skilletegn før nummerering.
* `number_padding` (`INT`, standard: `4`): Antall siffer i sekvensnummer (f.eks. `0001`).
* `number_start` (`INT`, standard: `1`): Startnummer for sekvensen.
* `extension` (`png`, `jpg`, `webp`, `gif`, `bmp`, `tiff`): Filformat.
* `quality` (`INT`, standard: `100`): Komprimeringskvalitet.
* `optimize_image` (`BOOLEAN`, standard: `True`): Optimaliser filstørrelse.
* `lossless_webp` (`BOOLEAN`, standard: `True`): Lossless WEBP.
* `dpi` (`INT`, standard: `300`): Oppløsning i DPI.
* `embed_workflow` (`BOOLEAN`, standard: `False`): Lagre ComfyUI-workflow i filens metadata.

### 📤 Outputs
* `images` (`IMAGE`): Passthrough av bildene.
* `saved_path` (`STRING`): Linjedelt streng med absolutte filbaner til alle lagrede bilder.

---

## 💾 SaveVideo (`🧘 Save Video & Frames (Dehypnotic)`)

**Kategori:** `Dehypnotic/💾 IO`

En alt-i-ett ekspertnode for lagring av video og/eller enkeltenkeltrammer direkte fra ComfyUI bildestrømmer, med sømløs lydmiks og høy encoderytelse.

### 🌟 Hovedfunksjoner
* **Tre lagringsmoduser:** `video`, `frames`, eller `video & frames`.
* **Konteinere & Kodeker:**
  * **MP4:** H.264 (`libx264`), H.265 (`libx265`), AV1 (`libaom-av1`).
  * **MKV:** Alle kodeker inkludert VP9, ProRes og DNxHR.
  * **WebM:** VP9 (`libvpx-vp9`), AV1 (`libaom-av1`).
  * **QuickTime MOV:** H.264, H.265, ProRes 422 HQ (`prores_ks`), DNxHR HQ (`dnxhr_hq`).
* **Videokvalitet og Speed (CRF & Presets):**
  * `crf` (Constant Rate Factor): Lav verdi = høyere kvalitet / større fil (typisk 18–28 for H.264).
  * `preset`: Encoder-hastighet (`ultrafast` til `veryslow`).
* **Lydintegrasjon (`audio`) & Loop Still to Audio:**
  * Koble et valgt lydspor direkte til noden.
  * Dersom du sender inn **1 enkeltbilde** sammen med et lydspor og `loop_still_to_audio` er aktivert, vil bildet automatisk forlenges/loopes til å matche hele lydsporets varighet!
* **Uttrekk av valgte bilderammer (`frames_select`):**
  * Lagre spesifikke rammer fra en video til en egen undermappe (`frames_dir`).
  * Mønstre: `-2` (siste bilde), `-1` (alle bilder), `0` (første bilde), eller komma-separert liste som `0,5,10`.

### 📥 Inputs
* `save_mode` (`"video"`, `"frames"`, `"video & frames"`): Hva som skal eksporteres.
* `images` (`IMAGE`): Bildesekvens eller enkeltbilde.
* `file_path` (`STRING`, standard: `"output/video"`): Mappe for videolagring.
* `container` (`mp4`, `mkv`, `webm`, `mov`): Formatkontainer.
* `video_codec` (`h264`, `h265`, `vp9`, `av1`, `prores`, `dnxhr`): Video-kodek.
* `fps` (`INT`, standard: `24`): Bildesekvenshastighet (Frames Per Second).
* `crf` (`INT`, standard: `23`): Kvalitetsfaktor.
* `preset` (`ultrafast` ... `veryslow`): Ytelsesprofil.
* `audio` (`AUDIO`, valgfritt): Lydspor som skal mikses inn.
* `loop_still_to_audio` (`BOOLEAN`, standard: `True`): Loop enkeltbilde til lydsporets lengde.
* `frames_dir` (`STRING`): Undermappe for eksport av enkeltrammer.
* `frames_select` (`STRING`, standard: `"-2"`): Hvilke rammer som skal eksporteres.

### 📤 Outputs
* `images` (`IMAGE`): Passthrough av bildene.
* `video_path` (`STRING`): Den absolutte filstien til den ferdig renderte videofilen.

---

## 📝 NumberedText (`🧘 NumberedText (Dehypnotic)`)

**Kategori:** `Dehypnotic/📝 Text Utils`

En interaktiv tekst-redigerer som lar deg organisere og selektivt aktivere/deaktivere avsnitt og prompt-deler ved hjelp av nummererte blokker og avmerkingsbokser.

### 🌟 Hovedfunksjoner
* **Smart tekst-oppdeling:**
  * Trykk **Enter** for å lage et nytt nummerert tekstpunkt (f.eks. `[x] 1. Første prompt`).
  * Trykk **Shift + Enter** for å sette inn linjeskift *innenfor* det samme nummererte punktet.
* **Selektiv aktivering (`[x]` og `[ ]`):**
  * Kun avmerkede punkter (`[x]`) blir inkludert i den endelige teksten når workflowen kjøres.
  * Punkter uten hake (`[ ]`) deaktiveres og ignoreres.
* **Fleksibel separator:** Slår sammen de valgte tekstblokkene med valgt separator (f.eks. `, `, `\n`, ` AND `).
* **Interaktive kontrollere:** Støtte for piltastnavigasjon og ombytting (swap) av tekstblokker direkte i grensesnittet.

### 📥 Inputs
* `text` (`STRING`, multiline): Tekstområde med nummererte avsnitt.
* `separator` (`STRING`, standard: `", "`): Skilletegn som settes inn mellom de aktive tekstblokkene (støtter spesielle tegn som `\n` og `\t`).

### 📤 Outputs
* `text` (`STRING`): Den sammenslåtte strengen bestående av alle aktive (`[x]`) tekstblokker.

---

## 🛠️ Ekstra funksjoner og sikkerhet

### 📁 Dynamiske plassholdere i filstier (Path Placeholders)
I nodene **SaveAudioMP3**, **SaveImages** og **SaveVideo** kan du bruke følgende variabler direkte i `file_path`, `date_subfolder_pattern` og `filename_prefix`:

* `[date]`: Dagens dato (`YYYY-MM-DD`).
* `[datetime]`: Dato og tid (`YYYY-MM-DD_HH-MM-SS`).
* `[time(%Y-%m)]`: Formaterer tidspunkt etter standard strftime-koder.
* `[unix]`: Unix timestamp (sekunder).
* `[guid]` / `[uuid]`: Unik random UUID4-streng.
* `[model]`: Navnet på detektert modell/checkpoint (hvis tilgjengelig).
* `[env(NAVN)]`: Henter verdi fra miljøvariabelen `NAVN`.

### 🔒 Whitelisting av eksterne lagringsbaner
Av sikkerhetshensyn tillater lagringsnodene i utgangspunktet kun skriving til ComfyUI sin `output`-mappe. Dersom du ønsker å lagre filer til andre disker eller nettverksdelinger, oppretter du filen `dehypnotic_save_allowed_paths.json` i rotmappen til ComfyUI (eller i `user/config/`):

```json
{
  "allowed_roots": [
    "D:/BilderOgVideo",
    "E:/Prosjekter/AudioExports"
  ]
}
```

Du kan også sette miljøvariabelen `DEHYPNOTIC_SAVE_ALLOWED_PATHS` til å peke på denne JSON-filen.

---

## ⚙️ Krav og installasjon

1. Klon eller kopier dette repositoriet inn i mappen `ComfyUI/custom_nodes/ComfyUI-Dehypnotic`.
2. Installer eventuelle avhengigheter dersom du skal bruke video- og lydfunksjonalitet:
   ```bash
   pip install numpy pillow imageio imageio-ffmpeg
   ```
3. Start ComfyUI på nytt. Nodene vil nå være tilgjengelige under mappen **`Dehypnotic`** i nodemenyen!
