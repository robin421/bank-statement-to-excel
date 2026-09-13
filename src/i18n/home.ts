import type { LocaleCode } from './locales';

/**
 * Homepage content per language.
 *
 * Deliberately *not* a translation of the English page. A translated homepage is
 * thin content that competes with itself; a localised homepage targets the
 * queries people actually type in that market, names the banks they actually
 * use, and explains the number and date conventions their statements and their
 * spreadsheet software follow.
 *
 * `translationStatus: 'needs-review'` on these locales means exactly what it
 * says: the structure and the market facts are deliberate, but the copy needs a
 * native speaker's pass before it is worth promoting. See the README.
 */

export interface LocalizedHome {
  /** Page <title>. */
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  lede: string;
  stats: Array<{ value: string; label: string }>;
  howHeading: string;
  steps: Array<{ title: string; body: string }>;
  formatsHeading: string;
  formatsBody: string[];
  /** Local statement conventions worth naming, as a definition list. */
  formatFacts: Array<{ term: string; detail: string }>;
  banksHeading: string;
  banksIntro: string;
  banks: string[];
  limitsHeading: string;
  limits: string[];
  faqHeading: string;
  faqs: Array<{ q: string; a: string }>;
}

export const HOME: Partial<Record<LocaleCode, LocalizedHome>> = {
  de: {
    title: 'Kontoauszug in Excel umwandeln — PDF zu XLSX oder CSV',
    description:
      'Kontoauszug-PDF kostenlos in Excel (.xlsx) oder CSV umwandeln. Läuft komplett im Browser — der Auszug wird nie hochgeladen. Jede Zeile wird gegen den fortlaufenden Saldo geprüft. Deutsche Zahlen- und Datumsformate inklusive.',
    eyebrow: 'Kostenlos · Ohne Anmeldung · Nichts wird hochgeladen',
    h1: 'Kontoauszug in Excel umwandeln',
    lede:
      'Laden Sie den Auszug aus Ihrem Online-Banking hoch und erhalten Sie eine saubere Tabelle zurück — mit deutschen Beträgen (1.234,56) und Datumsangaben (TT.MM.JJJJ). Jede Zeile wird gegen den fortlaufenden Saldo Ihres Auszugs geprüft, damit Sie vor dem Download sehen, ob die Daten stimmen.',
    stats: [
      { value: '0 Byte', label: 'hochgeladen — Umwandlung lokal' },
      { value: '.xlsx / .csv', label: 'plus QuickBooks und Xero' },
      { value: 'Saldo-geprüft', label: 'jede Zeile gegen den Saldo abgeglichen' },
    ],
    howHeading: 'So funktioniert es',
    steps: [
      {
        title: 'Auszug ablegen',
        body: 'Nehmen Sie die PDF, die Sie aus dem Online-Banking herunterladen. Sie wird in diesem Browser-Tab gelesen — es gibt keine Warteschlange.',
      },
      {
        title: 'Zeilen werden gelesen und geprüft',
        body: 'Die Umwandlung rekonstruiert die Tabelle aus den Textpositionen der PDF und vergleicht anschließend jede Zeile mit dem fortlaufenden Saldo. Was nicht aufgeht, wird markiert.',
      },
      {
        title: 'Herunterladen und weiterverwenden',
        body: 'Sie erhalten eine Excel-Arbeitsmappe, eine CSV-Datei oder ein Format, das QuickBooks Online bzw. Xero direkt einlesen können — mit Semikolon und Komma als Dezimaltrennzeichen.',
      },
    ],
    formatsHeading: 'Deutsche Formate — der Punkt, an dem andere Tools scheitern',
    formatsBody: [
      'Eine CSV mit Komma als Trennzeichen und Punkt als Dezimaltrennzeichen lässt sich in deutschem Excel nicht in Spalten öffnen. Deshalb schreibt dieses Tool für deutsche Formate standardmäßig Semikolon als Trennzeichen und Komma als Dezimaltrennzeichen.',
      'Das ist keine Übersetzungseinstellung, sondern eine Formateinstellung: Sie können sie jederzeit auf ein anderes Land umstellen — etwa für ein Konto in den USA oder in der Schweiz.',
    ],
    formatFacts: [
      { term: 'Beträge', detail: '1.234,56 — Komma als Dezimaltrennzeichen, Punkt als Tausendertrennzeichen' },
      { term: 'Datum', detail: 'TT.MM.JJJJ, wie auf deutschen Kontoauszügen üblich' },
      { term: 'CSV-Trennzeichen', detail: 'Semikolon, damit deutsches Excel die Datei in Spalten öffnet' },
      { term: 'Schweiz', detail: 'CHF-Auszüge: 1’234.56 mit Punkt als Dezimaltrennzeichen — im Format-Menü umstellbar' },
    ],
    banksHeading: 'Für Kontoauszüge deutscher Banken',
    banksIntro:
      'Der Parser arbeitet layoutbasiert und braucht keine Vorlage pro Bank. Diese Auszüge haben wir besonders häufig getestet — die Liste ist ein Hinweis, keine Einschränkung.',
    banks: ['Sparkasse', 'Volksbank / Raiffeisenbank', 'Commerzbank', 'Deutsche Bank', 'ING', 'DKB', 'comdirect', 'N26', 'Postbank', 'HypoVereinsbank'],
    limitsHeading: 'Was nicht funktioniert',
    limits: [
      'Eingescannte oder abfotografierte Auszüge. Das sind Bilder; dafür ist OCR nötig — hier steht, was dann hilft.',
      'PDFs mit kaputter Textebene. Manche Banken drucken mit Schriften, die nicht sauber dekodiert werden. Das Tool erkennt das und sagt es, statt Zeilen zu erfinden.',
      'Kategorisierung Ihrer Ausgaben. Es wandelt um, was im Auszug steht, und rät nichts dazu.',
      'Mehrere Auszüge auf einmal. Im Browser geht eine Datei nach der anderen.',
    ],
    faqHeading: 'Häufige Fragen',
    faqs: [
      {
        q: 'Wird mein Kontoauszug hochgeladen?',
        a: 'Nein. Die PDF wird von JavaScript in Ihrem Browser-Tab geöffnet und ausgelesen. Es gibt keinen Upload-Endpunkt, keinen Speicher und keine Warteschlange — Sie können im Netzwerk-Tab zusehen, wie keine einzige Anfrage hinausgeht. Deshalb funktioniert das Tool auch offline, sobald die Seite geladen ist.',
      },
      {
        q: 'Kann ich die CSV direkt in Excel öffnen?',
        a: 'Ja. Für deutsche Formate wird Semikolon als Trennzeichen und Komma als Dezimaltrennzeichen geschrieben, also genau so, wie deutsches Excel es erwartet. Beträge stehen ohne Tausendertrennzeichen in der Datei, damit sie als Zahl und nicht als Text ankommen.',
      },
      {
        q: 'Wie erkenne ich, ob die Zahlen stimmen?',
        a: 'Der Kontoauszug prüft sich selbst: Auf jeder Zeile gilt „vorheriger Saldo + Betrag = Saldo“. Das Tool rechnet das nach. Die Vorschau zeigt, wie viele Zeilen übereinstimmen; nicht passende Zeilen werden markiert statt stillschweigend übernommen.',
      },
      {
        q: 'Funktioniert das mit Sparkasse- oder Volksbank-Auszügen?',
        a: 'Ja. Das Verfahren richtet sich nach dem Layout der Seite, nicht nach der Bank, also funktioniert es auch bei Layouts, die wir nie gesehen haben. Ein bankspezifisches Template wäre sogar schlechter: Es würde bei einer Layout-Änderung stillschweigend falsche Werte liefern, während der Saldo-Abgleich laut scheitert.',
      },
      {
        q: 'Was kostet es?',
        a: 'Nichts. Keine Anmeldung, keine Zeilenbegrenzung, kein Wasserzeichen. Die Seite finanziert sich über Werbung und über Verweise auf OCR-Dienste für die eingescannten Auszüge, die dieses Tool nicht lesen kann.',
      },
    ],
  },

  es: {
    title: 'Convertir extracto bancario a Excel — PDF a XLSX o CSV',
    description:
      'Convierte un extracto bancario en PDF a Excel (.xlsx) o CSV gratis. Se ejecuta en tu navegador: el extracto nunca se sube. Cada fila se comprueba contra el saldo acumulado. Formatos españoles y latinoamericanos incluidos.',
    eyebrow: 'Gratis · Sin registro · No se sube nada',
    h1: 'Convertir extracto bancario a Excel',
    lede:
      'Suelta el extracto que descargas de tu banca online y obtén una hoja de cálculo limpia, con importes en tu formato (1.234,56) y fechas en DD/MM/AAAA. Cada fila se comprueba contra el saldo acumulado del propio extracto, para que veas si los datos son fiables antes de descargarlos.',
    stats: [
      { value: '0 bytes', label: 'subidos: la conversión es local' },
      { value: '.xlsx / .csv', label: 'además de QuickBooks y Xero' },
      { value: 'Cuadra el saldo', label: 'cada fila verificada contra el acumulado' },
    ],
    howHeading: 'Cómo funciona',
    steps: [
      {
        title: 'Suelta el PDF',
        body: 'Usa el extracto que te da tu banco, el PDF que descargas de la banca online. Se lee en esta pestaña, así que no hay cola de espera.',
      },
      {
        title: 'Se extraen y se comprueban las filas',
        body: 'La herramienta reconstruye la tabla a partir de las posiciones del texto y después verifica cada fila contra el saldo acumulado. Lo que no cuadra se marca.',
      },
      {
        title: 'Descarga y úsalo',
        body: 'Obtienes un libro de Excel, un CSV, o un archivo ya preparado para QuickBooks Online o Xero, con el separador y el decimal que espera tu programa.',
      },
    ],
    formatsHeading: 'Formatos en español: donde fallan los conversores genéricos',
    formatsBody: [
      'Un CSV con comas como separador y puntos como decimal no se abre en columnas en el Excel en español. Por eso, para formatos con coma decimal, esta herramienta escribe punto y coma como separador.',
      'No es un ajuste de idioma, es un ajuste de formato: puedes cambiarlo a otro país en cualquier momento, por ejemplo para una cuenta en México, donde se usa 1,234.56.',
    ],
    formatFacts: [
      { term: 'España, Argentina, Colombia', detail: '1.234,56 — coma decimal, punto de millares, CSV con punto y coma' },
      { term: 'México', detail: '1,234.56 — punto decimal, coma de millares, CSV con comas' },
      { term: 'Fecha', detail: 'DD/MM/AAAA en la mayoría de los países' },
      { term: 'Separador CSV', detail: 'Punto y coma donde el decimal es coma, para que Excel lo abra en columnas' },
    ],
    banksHeading: 'Para extractos de bancos españoles y latinoamericanos',
    banksIntro:
      'El analizador trabaja sobre la maquetación y no necesita una plantilla por banco. Estos son los extractos que más hemos probado; la lista es una orientación, no una limitación.',
    banks: ['BBVA', 'Santander', 'CaixaBank', 'Banco Sabadell', 'Bankinter', 'Openbank', 'ING España', 'Banco de Chile', 'Bancolombia', 'BBVA México'],
    limitsHeading: 'Lo que no hace',
    limits: [
      'Extractos escaneados o fotografiados. Son imágenes y necesitan OCR: aquí explicamos qué usar en ese caso.',
      'PDF con la capa de texto rota. Algunos bancos imprimen con fuentes que no se decodifican bien. La herramienta lo detecta y lo dice, en lugar de inventarse filas.',
      'Categorizar tus gastos. Convierte lo que dice el extracto; no adivina nada.',
      'Varios extractos a la vez. En el navegador se procesa un archivo cada vez.',
    ],
    faqHeading: 'Preguntas frecuentes',
    faqs: [
      {
        q: '¿Se sube mi extracto a algún servidor?',
        a: 'No. El PDF lo abre y lo lee JavaScript dentro de tu pestaña. No hay endpoint de subida, ni almacenamiento, ni cola: puedes comprobar en la pestaña Red que no sale ninguna petición. Por eso sigue funcionando sin conexión una vez cargada la página.',
      },
      {
        q: '¿Puedo abrir el CSV directamente en Excel?',
        a: 'Sí. En los formatos con coma decimal se escribe punto y coma como separador, que es lo que espera el Excel en español. Los importes van sin separador de millares para que lleguen como número y no como texto.',
      },
      {
        q: '¿Cómo sé si los números están bien?',
        a: 'El extracto se comprueba a sí mismo: en cada fila, «saldo anterior + importe = saldo». La herramienta rehace esa cuenta. La vista previa indica cuántas filas cuadran; las que no, se marcan en lugar de darse por buenas.',
      },
      {
        q: '¿Y si mi extracto tiene columnas de debe y haber?',
        a: 'Ese formato se detecta. Obtienes las dos cosas: las columnas originales de cargo y abono como números positivos, y además una columna de importe con signo. Cuál de los dos formatos usa tu extracto se deduce de los datos y se contrasta con el saldo acumulado, no se acepta porque lo diga la cabecera.',
      },
      {
        q: '¿Cuánto cuesta?',
        a: 'Nada. Sin registro, sin límite de filas y sin marca de agua. El sitio se financia con publicidad y con enlaces a servicios de OCR para los extractos escaneados que esta herramienta no puede leer.',
      },
    ],
  },

  fr: {
    title: 'Convertir un relevé bancaire en Excel — PDF vers XLSX ou CSV',
    description:
      'Convertissez gratuitement un relevé bancaire PDF en Excel (.xlsx) ou CSV. Tout se passe dans votre navigateur : le relevé n’est jamais envoyé. Chaque ligne est vérifiée par rapport au solde progressif. Formats français et canadiens inclus.',
    eyebrow: 'Gratuit · Sans inscription · Rien n’est envoyé',
    h1: 'Convertir un relevé bancaire en Excel',
    lede:
      'Déposez le relevé téléchargé depuis votre banque en ligne et récupérez un tableur propre, avec les montants au format français (1 234,56) et les dates en JJ/MM/AAAA. Chaque ligne est vérifiée par rapport au solde progressif du relevé, pour que vous sachiez si le résultat est fiable avant de le télécharger.',
    stats: [
      { value: '0 octet', label: 'envoyé — la conversion est locale' },
      { value: '.xlsx / .csv', label: 'plus QuickBooks et Xero' },
      { value: 'Solde vérifié', label: 'chaque ligne comparée au solde progressif' },
    ],
    howHeading: 'Comment ça marche',
    steps: [
      {
        title: 'Déposez le PDF',
        body: 'Utilisez le relevé fourni par votre banque, celui que vous téléchargez depuis la banque en ligne. Il est lu dans cet onglet : il n’y a aucune file d’attente.',
      },
      {
        title: 'Les lignes sont extraites et vérifiées',
        body: 'L’outil reconstruit le tableau à partir de la position du texte, puis vérifie chaque ligne par rapport au solde progressif. Ce qui ne concorde pas est signalé.',
      },
      {
        title: 'Téléchargez et utilisez',
        body: 'Vous obtenez un classeur Excel, un CSV, ou un fichier déjà au format attendu par QuickBooks Online ou Xero — avec le séparateur et la décimale que votre logiciel attend.',
      },
    ],
    formatsHeading: 'Formats français : là où les convertisseurs génériques échouent',
    formatsBody: [
      'Un CSV séparé par des virgules et utilisant le point comme décimale ne s’ouvre pas en colonnes dans Excel en français. C’est pourquoi, pour les formats à virgule décimale, cet outil écrit le point-virgule comme séparateur.',
      'Ce n’est pas un réglage de langue mais de format : vous pouvez le basculer à tout moment, par exemple pour un compte au Canada, où l’ordre AAAA-MM-JJ est courant.',
    ],
    formatFacts: [
      { term: 'Montants', detail: '1 234,56 — virgule décimale, espace insécable comme séparateur de milliers' },
      { term: 'Dates', detail: 'JJ/MM/AAAA en France, AAAA-MM-JJ fréquent au Québec' },
      { term: 'Séparateur CSV', detail: 'Point-virgule, pour qu’Excel en français ouvre bien les colonnes' },
      { term: 'Milliers', detail: 'Les séparateurs de milliers n’apparaissent jamais dans le fichier exporté : un espace casserait le CSV' },
    ],
    banksHeading: 'Pour les relevés des banques françaises et canadiennes',
    banksIntro:
      'L’analyse repose sur la mise en page et n’a pas besoin de modèle par banque. Ces relevés sont ceux que nous avons le plus testés ; la liste est indicative, pas restrictive.',
    banks: ['BNP Paribas', 'Société Générale', 'Crédit Agricole', 'Caisse d’Épargne', 'La Banque Postale', 'Boursorama', 'Hello bank!', 'Desjardins', 'Banque Nationale du Canada', 'LCL'],
    limitsHeading: 'Ce que l’outil ne fait pas',
    limits: [
      'Les relevés scannés ou photographiés. Ce sont des images et il faut de l’OCR : voici ce qui fonctionne dans ce cas.',
      'Les PDF dont la couche texte est abîmée. Certaines banques utilisent des polices qui se décodent mal. L’outil le détecte et le dit, plutôt que d’inventer des lignes.',
      'Catégoriser vos dépenses. Il convertit ce que dit le relevé ; il ne devine rien.',
      'Traiter plusieurs relevés à la fois. Dans le navigateur, c’est un fichier à la fois.',
    ],
    faqHeading: 'Questions fréquentes',
    faqs: [
      {
        q: 'Mon relevé est-il envoyé quelque part ?',
        a: 'Non. Le PDF est ouvert et lu par du JavaScript dans votre onglet. Il n’existe aucun point d’envoi, aucun stockage et aucune file d’attente : vous pouvez le vérifier dans l’onglet Réseau, aucune requête ne sort. C’est aussi pourquoi l’outil fonctionne hors connexion une fois la page chargée.',
      },
      {
        q: 'Puis-je ouvrir le CSV directement dans Excel ?',
        a: 'Oui. Pour les formats à virgule décimale, le séparateur écrit est le point-virgule, ce qu’attend Excel en français. Les montants sont écrits sans séparateur de milliers pour arriver comme nombres et non comme texte.',
      },
      {
        q: 'Comment savoir si les chiffres sont justes ?',
        a: 'Le relevé se vérifie lui-même : sur chaque ligne, « solde précédent + montant = solde ». L’outil refait ce calcul. L’aperçu indique combien de lignes concordent ; celles qui ne concordent pas sont signalées au lieu d’être présentées comme exactes.',
      },
      {
        q: 'Et si mon relevé a des colonnes débit et crédit séparées ?',
        a: 'Ce format est détecté. Vous obtenez les deux : les colonnes débit et crédit d’origine en nombres positifs, plus une colonne montant signée. Le choix entre les deux formats est déduit des données et recoupé avec le solde progressif, jamais accepté sur la foi de l’en-tête.',
      },
      {
        q: 'Combien ça coûte ?',
        a: 'Rien. Sans inscription, sans limite de lignes et sans filigrane. Le site est financé par la publicité et par des liens vers des services d’OCR pour les relevés scannés que cet outil ne sait pas lire.',
      },
    ],
  },

  pt: {
    title: 'Converter extrato bancário em Excel — PDF para XLSX ou CSV',
    description:
      'Converta um extrato bancário em PDF para Excel (.xlsx) ou CSV de graça. Roda no seu navegador: o extrato nunca é enviado. Cada linha é conferida contra o saldo acumulado. Formato brasileiro incluído.',
    eyebrow: 'Grátis · Sem cadastro · Nada é enviado',
    h1: 'Converter extrato bancário em Excel',
    lede:
      'Solte o extrato que você baixa do internet banking e receba uma planilha limpa, com valores no formato brasileiro (1.234,56) e datas em DD/MM/AAAA. Cada linha é conferida contra o saldo acumulado do próprio extrato, para você ver se os dados estão certos antes de baixar.',
    stats: [
      { value: '0 byte', label: 'enviado — a conversão é local' },
      { value: '.xlsx / .csv', label: 'além de QuickBooks e Xero' },
      { value: 'Saldo conferido', label: 'cada linha comparada ao saldo acumulado' },
    ],
    howHeading: 'Como funciona',
    steps: [
      {
        title: 'Solte o PDF',
        body: 'Use o extrato que o banco fornece, o PDF que você baixa do internet banking. Ele é lido nesta aba, então não existe fila de espera.',
      },
      {
        title: 'As linhas são extraídas e conferidas',
        body: 'A ferramenta reconstrói a tabela a partir da posição do texto e depois confere cada linha contra o saldo acumulado. O que não fecha é sinalizado.',
      },
      {
        title: 'Baixe e use',
        body: 'Você recebe uma pasta do Excel, um CSV, ou um arquivo já no formato que o QuickBooks Online ou o Xero esperam — com o separador e a vírgula decimal certos.',
      },
    ],
    formatsHeading: 'Formato brasileiro: onde os conversores genéricos falham',
    formatsBody: [
      'Um CSV separado por vírgulas e com ponto decimal não abre em colunas no Excel em português. Por isso, nos formatos com vírgula decimal, esta ferramenta grava ponto e vírgula como separador.',
      'Não é um ajuste de idioma, é de formato: você pode trocar para outro país quando quiser — por exemplo para uma conta em Portugal.',
    ],
    formatFacts: [
      { term: 'Valores', detail: '1.234,56 — vírgula decimal, ponto como separador de milhar' },
      { term: 'Datas', detail: 'DD/MM/AAAA' },
      { term: 'Separador do CSV', detail: 'Ponto e vírgula, para o Excel em português abrir em colunas' },
      { term: 'Milhares', detail: 'Nunca vão para o arquivo exportado: quebrariam o CSV e fariam a coluna chegar como texto' },
    ],
    banksHeading: 'Para extratos de bancos brasileiros',
    banksIntro:
      'O analisador trabalha sobre o layout e não precisa de modelo por banco. Estes são os extratos que mais testamos; a lista é orientação, não limitação.',
    banks: ['Nubank', 'Itaú', 'Bradesco', 'Banco do Brasil', 'Caixa Econômica Federal', 'Santander Brasil', 'Inter', 'C6 Bank', 'BTG Pactual', 'Sicredi'],
    limitsHeading: 'O que a ferramenta não faz',
    limits: [
      'Extratos digitalizados ou fotografados. São imagens e precisam de OCR: aqui explicamos o que usar nesse caso.',
      'PDFs com a camada de texto quebrada. Alguns bancos usam fontes que não decodificam bem. A ferramenta detecta isso e avisa, em vez de inventar linhas.',
      'Categorizar seus gastos. Ela converte o que o extrato diz; não adivinha nada.',
      'Vários extratos de uma vez. No navegador é um arquivo por vez.',
    ],
    faqHeading: 'Perguntas frequentes',
    faqs: [
      {
        q: 'Meu extrato é enviado para algum servidor?',
        a: 'Não. O PDF é aberto e lido por JavaScript dentro da sua aba. Não existe endpoint de upload, nem armazenamento, nem fila: você pode conferir na aba Rede que nenhuma requisição sai. É por isso que a ferramenta continua funcionando offline depois que a página carrega.',
      },
      {
        q: 'Consigo abrir o CSV direto no Excel?',
        a: 'Sim. Nos formatos com vírgula decimal, o separador gravado é o ponto e vírgula, que é o que o Excel em português espera. Os valores vão sem separador de milhar, para chegarem como número e não como texto.',
      },
      {
        q: 'Como sei se os números estão certos?',
        a: 'O extrato se confere sozinho: em cada linha, «saldo anterior + valor = saldo». A ferramenta refaz essa conta. A prévia mostra quantas linhas fecham; as que não fecham são sinalizadas, em vez de passarem como corretas.',
      },
      {
        q: 'E se o extrato tiver colunas separadas de débito e crédito?',
        a: 'Esse formato é detectado. Você recebe os dois: as colunas originais de débito e crédito como números positivos e também uma coluna de valor com sinal. Qual dos formatos o seu extrato usa é deduzido dos dados e conferido contra o saldo acumulado, não aceito pelo que diz o cabeçalho.',
      },
      {
        q: 'Quanto custa?',
        a: 'Nada. Sem cadastro, sem limite de linhas e sem marca d’água. O site se mantém com publicidade e com links para serviços de OCR nos extratos digitalizados que a ferramenta não consegue ler.',
      },
    ],
  },

  hi: {
    title: 'बैंक स्टेटमेंट को Excel में बदलें — PDF से XLSX या CSV',
    description:
      'बैंक स्टेटमेंट PDF को मुफ़्त में Excel (.xlsx) या CSV में बदलें। सब कुछ आपके ब्राउज़र में चलता है — स्टेटमेंट कभी अपलोड नहीं होता। हर पंक्ति चालू शेष से मिलाई जाती है। भारतीय फ़ॉर्मैट (लाख/करोड़) शामिल।',
    eyebrow: 'मुफ़्त · बिना साइन-अप · कुछ अपलोड नहीं होता',
    h1: 'बैंक स्टेटमेंट को Excel में बदलें',
    lede:
      'ऑनलाइन बैंकिंग से डाउनलोड किया स्टेटमेंट डालें और साफ़-सुथरी स्प्रेडशीट पाएँ — भारतीय तरीके से लिखी राशियाँ (12,34,567.89) और तारीख़ें (DD/MM/YYYY)। हर पंक्ति स्टेटमेंट के चालू शेष से मिलाई जाती है, ताकि डाउनलोड से पहले आप देख सकें कि आँकड़े सही हैं या नहीं।',
    stats: [
      { value: '0 बाइट', label: 'अपलोड — रूपांतरण आपके डिवाइस पर' },
      { value: '.xlsx / .csv', label: 'साथ में QuickBooks और Xero' },
      { value: 'शेष जाँचा', label: 'हर पंक्ति चालू शेष से मिलाई गई' },
    ],
    howHeading: 'यह कैसे काम करता है',
    steps: [
      {
        title: 'PDF डालें',
        body: 'वही स्टेटमेंट इस्तेमाल करें जो आपका बैंक देता है — ऑनलाइन बैंकिंग से डाउनलोड किया PDF। इसे इसी टैब में पढ़ा जाता है, कोई कतार नहीं है।',
      },
      {
        title: 'पंक्तियाँ निकाली और जाँची जाती हैं',
        body: 'टूल PDF में टेक्स्ट की स्थिति से तालिका दोबारा बनाता है, फिर हर पंक्ति को चालू शेष से मिलाता है। जो मेल नहीं खाता, उसे चिह्नित कर दिया जाता है।',
      },
      {
        title: 'डाउनलोड करें और इस्तेमाल करें',
        body: 'आपको Excel वर्कबुक, CSV, या QuickBooks Online और Xero के लिए तैयार फ़ाइल मिलती है — भारतीय अंक-समूहन और दिनांक क्रम के साथ।',
      },
    ],
    formatsHeading: 'भारतीय फ़ॉर्मैट: जहाँ आम टूल फ़ेल होते हैं',
    formatsBody: [
      'भारत में राशियाँ हज़ारों में नहीं, लाख और करोड़ में बँटती हैं: 12,34,567.89 — पहले तीन अंक, फिर दो-दो। जो टूल सिर्फ़ तीन-तीन अंकों का समूहन करता है, वह भारतीय स्टेटमेंट पर ग़लत पढ़ता है, और भारत में हज़ारों की जगह लाख में लिखा आँकड़ा सौ गुना फ़र्क़ डाल देता है।',
      'इस टूल में भारत के लिए अलग सेटिंग है, जिसमें अंक-समूहन लाख/करोड़ में होता है और तारीख़ें DD/MM/YYYY में लिखी जाती हैं।',
    ],
    formatFacts: [
      { term: 'राशियाँ', detail: '12,34,567.89 — लाख/करोड़ के हिसाब से समूहन, दशमलव के लिए बिंदु' },
      { term: 'तारीख़ें', detail: 'DD/MM/YYYY' },
      { term: 'CSV विभाजक', detail: 'कॉमा — क्योंकि दशमलव के लिए बिंदु इस्तेमाल होता है' },
      { term: 'बैंक', detail: 'HDFC, ICICI, SBI, Axis, Kotak जैसे बैंकों के लेआउट पर जाँचा गया' },
    ],
    banksHeading: 'भारतीय बैंकों के स्टेटमेंट के लिए',
    banksIntro:
      'पार्सर पेज के लेआउट पर काम करता है और उसे हर बैंक के लिए अलग टेम्पलेट की ज़रूरत नहीं होती। इन स्टेटमेंट पर सबसे ज़्यादा जाँच हुई है; यह सूची दिशा दिखाती है, सीमा नहीं।',
    banks: ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank', 'Bank of Baroda', 'Canara Bank', 'IDFC First Bank', 'Yes Bank'],
    limitsHeading: 'यह क्या नहीं करता',
    limits: [
      'स्कैन किए या फ़ोटो खींचे स्टेटमेंट। वे तस्वीरें हैं, उनके लिए OCR चाहिए — ऐसे में क्या करें, वह यहाँ लिखा है।',
      'टूटी टेक्स्ट लेयर वाली PDF। कुछ बैंक ऐसी फ़ॉन्ट इस्तेमाल करते हैं जो ठीक से डिकोड नहीं होतीं। टूल यह पहचान लेता है और बता देता है, पंक्तियाँ गढ़ता नहीं।',
      'आपके ख़र्चों की श्रेणी तय करना। यह वही बदलता है जो स्टेटमेंट में लिखा है; अंदाज़ा नहीं लगाता।',
      'एक साथ कई स्टेटमेंट। ब्राउज़र में एक बार में एक फ़ाइल।',
    ],
    faqHeading: 'अक्सर पूछे जाने वाले सवाल',
    faqs: [
      {
        q: 'क्या मेरा स्टेटमेंट कहीं अपलोड होता है?',
        a: 'नहीं। PDF को आपके ब्राउज़र टैब में JavaScript खोलता और पढ़ता है। कोई अपलोड एंडपॉइंट नहीं, कोई स्टोरेज नहीं, कोई कतार नहीं — आप Network टैब में देख सकते हैं कि कोई अनुरोध बाहर नहीं जाता। इसीलिए पेज लोड होने के बाद टूल ऑफ़लाइन भी चलता रहता है।',
      },
      {
        q: 'क्या CSV सीधे Excel में खुलेगी?',
        a: 'हाँ। भारत के लिए राशियों में दशमलव के लिए बिंदु और हज़ारों के लिए कॉमा लिखा जाता है, इसलिए CSV में कॉमा विभाजक रहता है और Excel उसे ठीक से खोलता है। राशियाँ बिना हज़ार-विभाजक के लिखी जाती हैं ताकि वे संख्या बनकर पहुँचें, टेक्स्ट नहीं।',
      },
      {
        q: 'पता कैसे चलेगा कि आँकड़े सही हैं?',
        a: 'स्टेटमेंट ख़ुद को जाँचता है: हर पंक्ति पर «पिछला शेष + राशि = शेष» होता है। टूल यही हिसाब दोबारा लगाता है। झलक में दिखता है कि कितनी पंक्तियाँ मेल खाती हैं; जो नहीं खातीं, उन्हें चिह्नित किया जाता है, सही मानकर आगे नहीं बढ़ा जाता।',
      },
      {
        q: 'क्या HDFC या ICICI के स्टेटमेंट चलते हैं?',
        a: 'हाँ। तरीक़ा पेज के लेआउट पर आधारित है, बैंक के नाम पर नहीं, इसलिए वे लेआउट भी चलते हैं जो हमने पहले नहीं देखे। बैंक-विशेष टेम्पलेट इससे बुरा होता: लेआउट बदलते ही वह चुपचाप ग़लत आँकड़े देता, जबकि शेष-मिलान ज़ोर से फ़ेल होता है।',
      },
      {
        q: 'इसका ख़र्च क्या है?',
        a: 'कुछ नहीं। न साइन-अप, न पंक्तियों की सीमा, न वॉटरमार्क। साइट विज्ञापनों से और उन स्कैन किए स्टेटमेंट के लिए OCR सेवाओं के लिंक से चलती है जिन्हें यह टूल नहीं पढ़ सकता।',
      },
    ],
  },
};
