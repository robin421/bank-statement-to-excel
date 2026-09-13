import type { LocaleCode } from './locales';

/**
 * Interface strings.
 *
 * English is the source of truth: `MessageKey` is derived from it, and every
 * dictionary is typed as a complete `Record<MessageKey, string>`. Adding a key
 * without translating it is therefore a **type error**, not a screen that
 * silently shows English in the middle of a German page.
 *
 * Placeholders use `{name}` and are filled by `t()`.
 */

const en = {
  'dropzone.title': 'Drop your bank statement here',
  'dropzone.hint': 'PDF from online banking, or an OFX / QFX export. Click to choose, or paste with Ctrl/⌘+V.',
  'dropzone.button': 'Choose statement file',
  'dropzone.limits': 'Text-based PDF up to 60 MB / 200 pages, or .ofx / .qfx',
  'dropzone.scanned': 'Scanned or photographed statement?',

  'status.starting': 'Starting…',
  'status.reading': 'Reading the file…',
  'status.extracting': 'Reading text from page {done} of {total}…',
  'status.extractingUnknown': 'Reading text…',
  'status.parsing': 'Matching rows and checking the running balance…',
  'status.finishing': 'Finishing…',
  'status.privacyNote':
    'This runs on your device. Nothing is uploaded, so a long statement takes as long as your computer needs — there is no server queue.',

  'password.title': 'This PDF is password protected',
  'password.hint':
    'Most banks use your date of birth, account number, or the last four digits of your card. The password is used on your device only.',
  'password.label': 'PDF password',
  'password.submit': 'Unlock and convert',
  'password.cancel': 'Cancel',

  'error.generic': 'Could not read this PDF. {message}',
  'error.ocrHint': 'Scanned statements need OCR.',
  'error.ocrLink': 'Try an OCR service instead',
  'error.ocrOr': 'or read about',
  'error.ocrWhy': 'why a scan cannot be read in the browser',
  'error.tryAnother': 'Try another file',
  'error.scannedLink': 'Scanned PDFs',
  'error.noRowsTitle': 'No transaction rows could be read from this PDF.',
  'error.noRowsFallback': 'It may be a scan or an unusually laid-out statement.',
  'error.scannedCta': 'What to do with scanned statements',

  'privacy.neverUploaded': 'Never uploaded — conversion happens in your browser',
  'privacy.noSignup': 'No sign-up, no email',
  'privacy.balanceChecked': "Rows checked against the statement's running balance",

  'badge.reconcile': '{matched}/{checked} rows reconcile',
  'badge.noBalance': 'No balance column to check against',
  'badge.check': 'check',
  'badge.transactions.one': '{count} transaction',
  'badge.transactions.other': '{count} transactions',

  'meta.pages.one': '{count} page',
  'meta.pages.other': '{count} pages',
  'meta.startOver': 'Start over',
  'meta.showingOf': 'Showing {shown} of {total} rows',
  'meta.allInDownload': ' — the download contains all of them',
  'meta.onlyFlagged': 'Only rows needing a check',

  'table.caption': 'Extracted transactions, preview before download',
  'table.date': 'Date',
  'table.description': 'Description',
  'table.debit': 'Debit',
  'table.credit': 'Credit',
  'table.amount': 'Amount',
  'table.balance': 'Balance',

  'mismatch.warning.one': '{count} row does not add up against the statement running balance.',
  'mismatch.warning.other': '{count} rows do not add up against the statement running balance.',
  'mismatch.warningSuffix': 'They are highlighted below and flagged in the Notes column, so you can check them against the original.',

  'dateOrder.title': 'Nothing in this statement proves the day/month order, so a date like 03/04/2025 is a guess.',
  'dateOrder.label': 'Date order',
  'dateOrder.auto': 'Auto (currently {value})',
  'dateOrder.mdy': 'Month/day (US)',
  'dateOrder.dmy': 'Day/month (UK, EU, India)',
  'dateOrder.recheck': 'Re-check rows',
  'dateOrder.hint': 'If the dates in the preview look wrong, switch it and re-check.',

  'download.format': 'Format',
  'download.dateFormat': 'Date format',
  'download.locale': 'Numbers and dates',
  'download.download': 'Download {format}',
  'download.alsoCsv': 'Also CSV',
  'download.preparing': 'Preparing…',
  'download.localeHint':
    'This is about the format inside the file, not the language. {locale} writes amounts as {sample}; importers in that market need exactly this.',

  'columns.date': 'Date',
  'columns.description': 'Description',
  'columns.debit': 'Debit',
  'columns.credit': 'Credit',
  'columns.amount': 'Amount',
  'columns.balance': 'Balance',
  'columns.notes': 'Notes',
} as const;

export type MessageKey = keyof typeof en;

type Dictionary = Record<MessageKey, string>;

const de: Dictionary = {
  'dropzone.title': 'Kontoauszug hier ablegen',
  'dropzone.hint': 'PDF aus dem Online-Banking oder ein OFX-/QFX-Export. Zum Auswählen klicken oder mit Strg/⌘+V einfügen.',
  'dropzone.button': 'Datei auswählen',
  'dropzone.limits': 'Textbasiertes PDF bis 60 MB / 200 Seiten, oder .ofx / .qfx',
  'dropzone.scanned': 'Eingescannten oder abfotografierten Auszug?',

  'status.starting': 'Wird gestartet…',
  'status.reading': 'Datei wird gelesen…',
  'status.extracting': 'Text wird gelesen: Seite {done} von {total}…',
  'status.extractingUnknown': 'Text wird gelesen…',
  'status.parsing': 'Zeilen werden zugeordnet und der Saldo wird geprüft…',
  'status.finishing': 'Wird abgeschlossen…',
  'status.privacyNote':
    'Das läuft auf Ihrem Gerät. Es wird nichts hochgeladen, deshalb dauert ein langer Auszug so lange, wie Ihr Rechner braucht — es gibt keine Server-Warteschlange.',

  'password.title': 'Diese PDF ist passwortgeschützt',
  'password.hint':
    'Die meisten Banken verwenden Ihr Geburtsdatum, Ihre Kontonummer oder die letzten vier Ziffern Ihrer Karte. Das Passwort wird nur auf Ihrem Gerät verwendet.',
  'password.label': 'PDF-Passwort',
  'password.submit': 'Entsperren und umwandeln',
  'password.cancel': 'Abbrechen',

  'error.generic': 'Diese PDF konnte nicht gelesen werden. {message}',
  'error.ocrHint': 'Eingescannte Auszüge benötigen OCR.',
  'error.ocrLink': 'Stattdessen einen OCR-Dienst verwenden',
  'error.ocrOr': 'oder lesen Sie,',
  'error.ocrWhy': 'warum ein Scan im Browser nicht gelesen werden kann',
  'error.tryAnother': 'Andere Datei versuchen',
  'error.scannedLink': 'Eingescannte PDFs',
  'error.noRowsTitle': 'Aus dieser PDF konnten keine Buchungszeilen gelesen werden.',
  'error.noRowsFallback': 'Möglicherweise ist es ein Scan oder ein ungewöhnlich aufgebauter Auszug.',
  'error.scannedCta': 'Was bei eingescannten Auszügen hilft',

  'privacy.neverUploaded': 'Wird nie hochgeladen — die Umwandlung erfolgt in Ihrem Browser',
  'privacy.noSignup': 'Keine Anmeldung, keine E-Mail',
  'privacy.balanceChecked': 'Jede Zeile wird gegen den fortlaufenden Saldo geprüft',

  'badge.reconcile': '{matched}/{checked} Zeilen stimmen überein',
  'badge.noBalance': 'Keine Saldo-Spalte zum Abgleichen vorhanden',
  'badge.check': 'prüfen',
  'badge.transactions.one': '{count} Buchung',
  'badge.transactions.other': '{count} Buchungen',

  'meta.pages.one': '{count} Seite',
  'meta.pages.other': '{count} Seiten',
  'meta.startOver': 'Neu beginnen',
  'meta.showingOf': '{shown} von {total} Zeilen werden angezeigt',
  'meta.allInDownload': ' — der Download enthält alle',
  'meta.onlyFlagged': 'Nur zu prüfende Zeilen',

  'table.caption': 'Extrahierte Buchungen, Vorschau vor dem Download',
  'table.date': 'Datum',
  'table.description': 'Verwendungszweck',
  'table.debit': 'Soll',
  'table.credit': 'Haben',
  'table.amount': 'Betrag',
  'table.balance': 'Saldo',

  'mismatch.warning.one': '{count} Zeile passt nicht zum fortlaufenden Saldo des Auszugs.',
  'mismatch.warning.other': '{count} Zeilen passen nicht zum fortlaufenden Saldo des Auszugs.',
  'mismatch.warningSuffix': 'Sie sind unten markiert und in der Spalte „Notes“ gekennzeichnet, damit Sie sie mit dem Original vergleichen können.',

  'dateOrder.title': 'Nichts in diesem Auszug belegt die Reihenfolge Tag/Monat — ein Datum wie 03.04.2025 ist also eine Annahme.',
  'dateOrder.label': 'Datumsreihenfolge',
  'dateOrder.auto': 'Automatisch (derzeit {value})',
  'dateOrder.mdy': 'Monat/Tag (USA)',
  'dateOrder.dmy': 'Tag/Monat (Europa, Indien)',
  'dateOrder.recheck': 'Zeilen neu prüfen',
  'dateOrder.hint': 'Wenn die Daten in der Vorschau falsch aussehen, umstellen und neu prüfen.',

  'download.format': 'Format',
  'download.dateFormat': 'Datumsformat',
  'download.locale': 'Zahlen und Daten',
  'download.download': '{format} herunterladen',
  'download.alsoCsv': 'Auch als CSV',
  'download.preparing': 'Wird vorbereitet…',
  'download.localeHint':
    'Das betrifft das Format in der Datei, nicht die Sprache. {locale} schreibt Beträge als {sample}; Importprogramme in diesem Markt erwarten genau das.',

  'columns.date': 'Datum',
  'columns.description': 'Verwendungszweck',
  'columns.debit': 'Soll',
  'columns.credit': 'Haben',
  'columns.amount': 'Betrag',
  'columns.balance': 'Saldo',
  'columns.notes': 'Hinweise',
};

const es: Dictionary = {
  'dropzone.title': 'Suelta aquí tu extracto bancario',
  'dropzone.hint': 'PDF de la banca online, o un archivo OFX / QFX. Haz clic para elegir, o pega con Ctrl/⌘+V.',
  'dropzone.button': 'Elegir archivo',
  'dropzone.limits': 'PDF con capa de texto de hasta 60 MB / 200 páginas, o .ofx / .qfx',
  'dropzone.scanned': '¿Extracto escaneado o fotografiado?',

  'status.starting': 'Iniciando…',
  'status.reading': 'Leyendo el archivo…',
  'status.extracting': 'Leyendo el texto de la página {done} de {total}…',
  'status.extractingUnknown': 'Leyendo el texto…',
  'status.parsing': 'Emparejando filas y comprobando el saldo acumulado…',
  'status.finishing': 'Terminando…',
  'status.privacyNote':
    'Esto se ejecuta en tu dispositivo. No se sube nada, así que un extracto largo tarda lo que tarde tu ordenador: no hay cola en ningún servidor.',

  'password.title': 'Este PDF está protegido con contraseña',
  'password.hint':
    'La mayoría de los bancos usan tu fecha de nacimiento, tu número de cuenta o las cuatro últimas cifras de tu tarjeta. La contraseña se usa solo en tu dispositivo.',
  'password.label': 'Contraseña del PDF',
  'password.submit': 'Desbloquear y convertir',
  'password.cancel': 'Cancelar',

  'error.generic': 'No se ha podido leer este PDF. {message}',
  'error.ocrHint': 'Los extractos escaneados necesitan OCR.',
  'error.ocrLink': 'Usar mejor un servicio de OCR',
  'error.ocrOr': 'o lee por qué',
  'error.ocrWhy': 'un escaneo no se puede leer en el navegador',
  'error.tryAnother': 'Probar otro archivo',
  'error.scannedLink': 'PDF escaneados',
  'error.noRowsTitle': 'No se ha podido leer ninguna fila de movimientos de este PDF.',
  'error.noRowsFallback': 'Puede que sea un escaneo o un extracto con una maquetación poco habitual.',
  'error.scannedCta': 'Qué hacer con extractos escaneados',

  'privacy.neverUploaded': 'Nunca se sube: la conversión ocurre en tu navegador',
  'privacy.noSignup': 'Sin registro ni correo',
  'privacy.balanceChecked': 'Cada fila se comprueba contra el saldo acumulado del extracto',

  'badge.reconcile': '{matched}/{checked} filas cuadran',
  'badge.noBalance': 'No hay columna de saldo con la que comprobar',
  'badge.check': 'revisar',
  'badge.transactions.one': '{count} movimiento',
  'badge.transactions.other': '{count} movimientos',

  'meta.pages.one': '{count} página',
  'meta.pages.other': '{count} páginas',
  'meta.startOver': 'Empezar de nuevo',
  'meta.showingOf': 'Mostrando {shown} de {total} filas',
  'meta.allInDownload': ' — la descarga las incluye todas',
  'meta.onlyFlagged': 'Solo las filas que hay que revisar',

  'table.caption': 'Movimientos extraídos, vista previa antes de descargar',
  'table.date': 'Fecha',
  'table.description': 'Concepto',
  'table.debit': 'Cargo',
  'table.credit': 'Abono',
  'table.amount': 'Importe',
  'table.balance': 'Saldo',

  'mismatch.warning.one': '{count} fila no cuadra con el saldo acumulado del extracto.',
  'mismatch.warning.other': '{count} filas no cuadran con el saldo acumulado del extracto.',
  'mismatch.warningSuffix': 'Aparecen resaltadas abajo y marcadas en la columna Notes, para que puedas compararlas con el original.',

  'dateOrder.title': 'Nada en este extracto demuestra el orden día/mes, así que una fecha como 03/04/2025 es una suposición.',
  'dateOrder.label': 'Orden de la fecha',
  'dateOrder.auto': 'Automático (ahora {value})',
  'dateOrder.mdy': 'Mes/día (EE. UU.)',
  'dateOrder.dmy': 'Día/mes (Europa, India, Latinoamérica)',
  'dateOrder.recheck': 'Volver a comprobar',
  'dateOrder.hint': 'Si las fechas de la vista previa parecen mal, cámbialo y vuelve a comprobar.',

  'download.format': 'Formato',
  'download.dateFormat': 'Formato de fecha',
  'download.locale': 'Números y fechas',
  'download.download': 'Descargar {format}',
  'download.alsoCsv': 'También CSV',
  'download.preparing': 'Preparando…',
  'download.localeHint':
    'Esto afecta al formato dentro del archivo, no al idioma. {locale} escribe los importes como {sample}; los programas de importación de ese mercado esperan exactamente eso.',

  'columns.date': 'Fecha',
  'columns.description': 'Concepto',
  'columns.debit': 'Cargo',
  'columns.credit': 'Abono',
  'columns.amount': 'Importe',
  'columns.balance': 'Saldo',
  'columns.notes': 'Notas',
};

const fr: Dictionary = {
  'dropzone.title': 'Déposez votre relevé bancaire ici',
  'dropzone.hint': 'PDF issu de la banque en ligne, ou un export OFX / QFX. Cliquez pour choisir, ou collez avec Ctrl/⌘+V.',
  'dropzone.button': 'Choisir un fichier',
  'dropzone.limits': 'PDF avec couche texte jusqu’à 60 Mo / 200 pages, ou .ofx / .qfx',
  'dropzone.scanned': 'Relevé scanné ou photographié ?',

  'status.starting': 'Démarrage…',
  'status.reading': 'Lecture du fichier…',
  'status.extracting': 'Lecture du texte : page {done} sur {total}…',
  'status.extractingUnknown': 'Lecture du texte…',
  'status.parsing': 'Association des lignes et vérification du solde progressif…',
  'status.finishing': 'Finalisation…',
  'status.privacyNote':
    'Tout se passe sur votre appareil. Rien n’est téléversé : un relevé long prend donc le temps que met votre ordinateur, sans file d’attente serveur.',

  'password.title': 'Ce PDF est protégé par un mot de passe',
  'password.hint':
    'La plupart des banques utilisent votre date de naissance, votre numéro de compte ou les quatre derniers chiffres de votre carte. Le mot de passe reste sur votre appareil.',
  'password.label': 'Mot de passe du PDF',
  'password.submit': 'Déverrouiller et convertir',
  'password.cancel': 'Annuler',

  'error.generic': 'Impossible de lire ce PDF. {message}',
  'error.ocrHint': 'Les relevés scannés nécessitent de l’OCR.',
  'error.ocrLink': 'Utiliser plutôt un service d’OCR',
  'error.ocrOr': 'ou découvrez',
  'error.ocrWhy': 'pourquoi un scan ne peut pas être lu dans le navigateur',
  'error.tryAnother': 'Essayer un autre fichier',
  'error.scannedLink': 'PDF scannés',
  'error.noRowsTitle': 'Aucune ligne d’opération n’a pu être lue dans ce PDF.',
  'error.noRowsFallback': 'Il s’agit peut-être d’un scan ou d’un relevé à la mise en page inhabituelle.',
  'error.scannedCta': 'Que faire des relevés scannés',

  'privacy.neverUploaded': 'Jamais téléversé — la conversion a lieu dans votre navigateur',
  'privacy.noSignup': 'Sans inscription ni e-mail',
  'privacy.balanceChecked': 'Chaque ligne est vérifiée par rapport au solde progressif du relevé',

  'badge.reconcile': '{matched}/{checked} lignes concordent',
  'badge.noBalance': 'Aucune colonne de solde pour vérifier',
  'badge.check': 'à vérifier',
  'badge.transactions.one': '{count} opération',
  'badge.transactions.other': '{count} opérations',

  'meta.pages.one': '{count} page',
  'meta.pages.other': '{count} pages',
  'meta.startOver': 'Recommencer',
  'meta.showingOf': 'Affichage de {shown} lignes sur {total}',
  'meta.allInDownload': ' — le téléchargement les contient toutes',
  'meta.onlyFlagged': 'Uniquement les lignes à vérifier',

  'table.caption': 'Opérations extraites, aperçu avant téléchargement',
  'table.date': 'Date',
  'table.description': 'Libellé',
  'table.debit': 'Débit',
  'table.credit': 'Crédit',
  'table.amount': 'Montant',
  'table.balance': 'Solde',

  'mismatch.warning.one': '{count} ligne ne correspond pas au solde progressif du relevé.',
  'mismatch.warning.other': '{count} lignes ne correspondent pas au solde progressif du relevé.',
  'mismatch.warningSuffix': 'Elles sont surlignées ci-dessous et signalées dans la colonne Notes, pour que vous puissiez les comparer à l’original.',

  'dateOrder.title': 'Rien dans ce relevé ne prouve l’ordre jour/mois : une date comme 03/04/2025 est donc une supposition.',
  'dateOrder.label': 'Ordre de la date',
  'dateOrder.auto': 'Automatique (actuellement {value})',
  'dateOrder.mdy': 'Mois/jour (États-Unis)',
  'dateOrder.dmy': 'Jour/mois (Europe, Inde, Canada)',
  'dateOrder.recheck': 'Revérifier les lignes',
  'dateOrder.hint': 'Si les dates de l’aperçu semblent fausses, changez ce réglage et relancez la vérification.',

  'download.format': 'Format',
  'download.dateFormat': 'Format de date',
  'download.locale': 'Nombres et dates',
  'download.download': 'Télécharger {format}',
  'download.alsoCsv': 'Aussi en CSV',
  'download.preparing': 'Préparation…',
  'download.localeHint':
    'Cela concerne le format à l’intérieur du fichier, pas la langue. {locale} écrit les montants sous la forme {sample} ; les logiciels d’importation de ce marché attendent exactement cela.',

  'columns.date': 'Date',
  'columns.description': 'Libellé',
  'columns.debit': 'Débit',
  'columns.credit': 'Crédit',
  'columns.amount': 'Montant',
  'columns.balance': 'Solde',
  'columns.notes': 'Notes',
};

const pt: Dictionary = {
  'dropzone.title': 'Solte aqui o seu extrato bancário',
  'dropzone.hint': 'PDF do internet banking, ou um arquivo OFX / QFX. Clique para escolher, ou cole com Ctrl/⌘+V.',
  'dropzone.button': 'Escolher arquivo',
  'dropzone.limits': 'PDF com camada de texto de até 60 MB / 200 páginas, ou .ofx / .qfx',
  'dropzone.scanned': 'Extrato digitalizado ou fotografado?',

  'status.starting': 'Iniciando…',
  'status.reading': 'Lendo o arquivo…',
  'status.extracting': 'Lendo o texto da página {done} de {total}…',
  'status.extractingUnknown': 'Lendo o texto…',
  'status.parsing': 'Cruzando as linhas e conferindo o saldo acumulado…',
  'status.finishing': 'Finalizando…',
  'status.privacyNote':
    'Isso roda no seu dispositivo. Nada é enviado, então um extrato longo demora o que o seu computador precisar — não há fila em servidor.',

  'password.title': 'Este PDF tem senha',
  'password.hint':
    'A maioria dos bancos usa a sua data de nascimento, o número da conta ou os quatro últimos dígitos do cartão. A senha é usada apenas no seu dispositivo.',
  'password.label': 'Senha do PDF',
  'password.submit': 'Desbloquear e converter',
  'password.cancel': 'Cancelar',

  'error.generic': 'Não foi possível ler este PDF. {message}',
  'error.ocrHint': 'Extratos digitalizados precisam de OCR.',
  'error.ocrLink': 'Usar um serviço de OCR',
  'error.ocrOr': 'ou entenda',
  'error.ocrWhy': 'por que um digitalizado não pode ser lido no navegador',
  'error.tryAnother': 'Tentar outro arquivo',
  'error.scannedLink': 'PDFs digitalizados',
  'error.noRowsTitle': 'Não foi possível ler nenhuma linha de lançamento neste PDF.',
  'error.noRowsFallback': 'Pode ser um digitalizado ou um extrato com layout incomum.',
  'error.scannedCta': 'O que fazer com extratos digitalizados',

  'privacy.neverUploaded': 'Nunca é enviado — a conversão acontece no seu navegador',
  'privacy.noSignup': 'Sem cadastro e sem e-mail',
  'privacy.balanceChecked': 'Cada linha é conferida contra o saldo acumulado do extrato',

  'badge.reconcile': '{matched}/{checked} linhas conferem',
  'badge.noBalance': 'Sem coluna de saldo para conferir',
  'badge.check': 'conferir',
  'badge.transactions.one': '{count} lançamento',
  'badge.transactions.other': '{count} lançamentos',

  'meta.pages.one': '{count} página',
  'meta.pages.other': '{count} páginas',
  'meta.startOver': 'Começar de novo',
  'meta.showingOf': 'Mostrando {shown} de {total} linhas',
  'meta.allInDownload': ' — o download traz todas',
  'meta.onlyFlagged': 'Somente as linhas que precisam de conferência',

  'table.caption': 'Lançamentos extraídos, prévia antes do download',
  'table.date': 'Data',
  'table.description': 'Descrição',
  'table.debit': 'Débito',
  'table.credit': 'Crédito',
  'table.amount': 'Valor',
  'table.balance': 'Saldo',

  'mismatch.warning.one': '{count} linha não fecha com o saldo acumulado do extrato.',
  'mismatch.warning.other': '{count} linhas não fecham com o saldo acumulado do extrato.',
  'mismatch.warningSuffix': 'Elas aparecem destacadas abaixo e marcadas na coluna Notes, para você comparar com o original.',

  'dateOrder.title': 'Nada neste extrato comprova a ordem dia/mês, então uma data como 03/04/2025 é um palpite.',
  'dateOrder.label': 'Ordem da data',
  'dateOrder.auto': 'Automático (atualmente {value})',
  'dateOrder.mdy': 'Mês/dia (EUA)',
  'dateOrder.dmy': 'Dia/mês (Brasil, Europa, Índia)',
  'dateOrder.recheck': 'Conferir de novo',
  'dateOrder.hint': 'Se as datas na prévia parecerem erradas, troque a opção e confira novamente.',

  'download.format': 'Formato',
  'download.dateFormat': 'Formato de data',
  'download.locale': 'Números e datas',
  'download.download': 'Baixar {format}',
  'download.alsoCsv': 'Também em CSV',
  'download.preparing': 'Preparando…',
  'download.localeHint':
    'Isto é sobre o formato dentro do arquivo, não sobre o idioma. {locale} escreve os valores como {sample}; os importadores desse mercado esperam exatamente isso.',

  'columns.date': 'Data',
  'columns.description': 'Descrição',
  'columns.debit': 'Débito',
  'columns.credit': 'Crédito',
  'columns.amount': 'Valor',
  'columns.balance': 'Saldo',
  'columns.notes': 'Observações',
};

const hi: Dictionary = {
  'dropzone.title': 'अपना बैंक स्टेटमेंट यहाँ छोड़ें',
  'dropzone.hint': 'ऑनलाइन बैंकिंग से डाउनलोड किया PDF, या OFX / QFX फ़ाइल। चुनने के लिए क्लिक करें, या Ctrl/⌘+V से पेस्ट करें।',
  'dropzone.button': 'फ़ाइल चुनें',
  'dropzone.limits': 'टेक्स्ट वाला PDF, 60 MB / 200 पृष्ठ तक, या .ofx / .qfx',
  'dropzone.scanned': 'स्कैन किया या फ़ोटो खींचा स्टेटमेंट?',

  'status.starting': 'शुरू हो रहा है…',
  'status.reading': 'फ़ाइल पढ़ी जा रही है…',
  'status.extracting': 'पृष्ठ {done} / {total} से टेक्स्ट पढ़ा जा रहा है…',
  'status.extractingUnknown': 'टेक्स्ट पढ़ा जा रहा है…',
  'status.parsing': 'पंक्तियाँ मिलाई जा रही हैं और चालू शेष जाँचा जा रहा है…',
  'status.finishing': 'पूरा हो रहा है…',
  'status.privacyNote':
    'यह आपके डिवाइस पर चलता है। कुछ भी अपलोड नहीं होता, इसलिए बड़े स्टेटमेंट में उतना समय लगेगा जितना आपके कंप्यूटर को चाहिए — कोई सर्वर कतार नहीं है।',

  'password.title': 'यह PDF पासवर्ड से सुरक्षित है',
  'password.hint':
    'अधिकतर बैंक आपकी जन्मतिथि, खाता संख्या या कार्ड के अंतिम चार अंक इस्तेमाल करते हैं। पासवर्ड केवल आपके डिवाइस पर इस्तेमाल होता है।',
  'password.label': 'PDF पासवर्ड',
  'password.submit': 'अनलॉक करें और बदलें',
  'password.cancel': 'रद्द करें',

  'error.generic': 'यह PDF पढ़ी नहीं जा सकी। {message}',
  'error.ocrHint': 'स्कैन किए स्टेटमेंट के लिए OCR चाहिए।',
  'error.ocrLink': 'इसके बजाय OCR सेवा आज़माएँ',
  'error.ocrOr': 'या जानें कि',
  'error.ocrWhy': 'स्कैन को ब्राउज़र में क्यों नहीं पढ़ा जा सकता',
  'error.tryAnother': 'दूसरी फ़ाइल आज़माएँ',
  'error.scannedLink': 'स्कैन किए PDF',
  'error.noRowsTitle': 'इस PDF से कोई लेन-देन पंक्ति नहीं पढ़ी जा सकी।',
  'error.noRowsFallback': 'यह शायद स्कैन है, या स्टेटमेंट का लेआउट असामान्य है।',
  'error.scannedCta': 'स्कैन किए स्टेटमेंट का क्या करें',

  'privacy.neverUploaded': 'कभी अपलोड नहीं होता — रूपांतरण आपके ब्राउज़र में होता है',
  'privacy.noSignup': 'न साइन-अप, न ईमेल',
  'privacy.balanceChecked': 'हर पंक्ति स्टेटमेंट के चालू शेष से मिलाई जाती है',

  'badge.reconcile': '{matched}/{checked} पंक्तियाँ मेल खाती हैं',
  'badge.noBalance': 'मिलान के लिए कोई शेष कॉलम नहीं मिला',
  'badge.check': 'जाँचें',
  'badge.transactions.one': '{count} लेन-देन',
  'badge.transactions.other': '{count} लेन-देन',

  'meta.pages.one': '{count} पृष्ठ',
  'meta.pages.other': '{count} पृष्ठ',
  'meta.startOver': 'फिर से शुरू करें',
  'meta.showingOf': '{total} में से {shown} पंक्तियाँ दिखाई जा रही हैं',
  'meta.allInDownload': ' — डाउनलोड में सभी शामिल हैं',
  'meta.onlyFlagged': 'केवल जाँच वाली पंक्तियाँ',

  'table.caption': 'निकाले गए लेन-देन, डाउनलोड से पहले झलक',
  'table.date': 'दिनांक',
  'table.description': 'विवरण',
  'table.debit': 'नामे',
  'table.credit': 'जमा',
  'table.amount': 'राशि',
  'table.balance': 'शेष',

  'mismatch.warning.one': '{count} पंक्ति स्टेटमेंट के चालू शेष से मेल नहीं खाती।',
  'mismatch.warning.other': '{count} पंक्तियाँ स्टेटमेंट के चालू शेष से मेल नहीं खातीं।',
  'mismatch.warningSuffix': 'वे नीचे हाइलाइट हैं और Notes कॉलम में चिह्नित हैं, ताकि आप उन्हें मूल स्टेटमेंट से मिला सकें।',

  'dateOrder.title': 'इस स्टेटमेंट में कुछ भी दिन/महीने का क्रम सिद्ध नहीं करता, इसलिए 03/04/2025 जैसी तारीख़ एक अनुमान है।',
  'dateOrder.label': 'दिनांक का क्रम',
  'dateOrder.auto': 'स्वतः (अभी {value})',
  'dateOrder.mdy': 'महीना/दिन (अमेरिका)',
  'dateOrder.dmy': 'दिन/महीना (भारत, यूरोप)',
  'dateOrder.recheck': 'पंक्तियाँ फिर जाँचें',
  'dateOrder.hint': 'अगर झलक में तारीख़ें ग़लत लगें, तो बदलकर फिर जाँचें।',

  'download.format': 'फ़ॉर्मैट',
  'download.dateFormat': 'दिनांक फ़ॉर्मैट',
  'download.locale': 'संख्याएँ और दिनांक',
  'download.download': '{format} डाउनलोड करें',
  'download.alsoCsv': 'CSV भी',
  'download.preparing': 'तैयार हो रहा है…',
  'download.localeHint':
    'यह फ़ाइल के अंदर के फ़ॉर्मैट की बात है, भाषा की नहीं। {locale} राशियाँ {sample} की तरह लिखता है; उस बाज़ार के इम्पोर्टर ठीक यही अपेक्षा करते हैं।',

  'columns.date': 'दिनांक',
  'columns.description': 'विवरण',
  'columns.debit': 'नामे',
  'columns.credit': 'जमा',
  'columns.amount': 'राशि',
  'columns.balance': 'शेष',
  'columns.notes': 'टिप्पणियाँ',
};

export const MESSAGES: Record<LocaleCode, Dictionary> = { en, de, es, fr, pt, hi };
