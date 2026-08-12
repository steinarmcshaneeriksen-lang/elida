/**
 * Common Accounting Scenarios
 *
 * Pre-built scenarios for frequently asked accounting questions.
 * Each scenario defines keywords for matching, typical accounts,
 * VAT treatment, and risk level.
 *
 * The advisor uses these as a first-pass heuristic before
 * consulting the company's specific chart of accounts and history.
 */

import type { CommonScenario } from "../types";

export const COMMON_SCENARIOS: CommonScenario[] = [
  // ── Software & IT ────────────────────────────────────────────────────
  {
    id: "scenario-software-subscription",
    name_nb: "Programvareabonnement (SaaS)",
    keywords: [
      "programvare",
      "software",
      "saas",
      "abonnement",
      "lisens",
      "adobe",
      "microsoft 365",
      "office 365",
      "google workspace",
      "slack",
      "dropbox",
      "github",
      "figma",
      "canva",
      "salesforce",
      "hubspot",
      "zoom",
      "teams",
      "atlassian",
      "jira",
      "notion",
      "asana",
      "monday",
      "aws",
      "azure",
      "skytjenester",
      "cloud",
      "hosting",
    ],
    typical_accounts: [
      { number: "6560", name: "Programvare" },
      { number: "6550", name: "Datautstyr" },
    ],
    vat_treatment: {
      rate: 25,
      code: "1",
      deductible: true,
      notes_nb:
        "Norsk leverandør: 25 % MVA med fradrag. " +
        "Utenlandsk leverandør: snudd avregning (reverse charge), " +
        "beregn 25 % utgående MVA og krev tilsvarende fradrag.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Løpende SaaS-abonnementer kostnadsføres. " +
      "Årsabonnementer over vesentlighetsgrensen bør periodiseres. " +
      "Engangs-programvarelisenser over kr 15 000 kan måtte aktiveres.",
    conditions_nb:
      "Sjekk om leverandør er norsk eller utenlandsk for korrekt MVA-behandling.",
  },
  {
    id: "scenario-computer-under-threshold",
    name_nb: "Datautstyr under aktiveringsgrensen",
    keywords: [
      "pc",
      "laptop",
      "nettbrett",
      "ipad",
      "tablet",
      "macbook",
      "chromebook",
      "skjerm",
      "monitor",
      "tastatur",
      "mus",
      "headset",
      "webkamera",
      "dokkingstasjon",
      "skrivemaskin",
      "periferiutstyr",
    ],
    typical_accounts: [
      { number: "6550", name: "Datautstyr" },
      { number: "6500", name: "Verktøy, inventar og driftsmaterialer" },
    ],
    vat_treatment: {
      rate: 25,
      code: "1",
      deductible: true,
      notes_nb: "Full MVA-fradrag for utstyr til næringsbruk.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Datautstyr under kr 15 000 ekskl. MVA kostnadsføres direkte. " +
      "Husk at like gjenstander kjøpt samtidig kan vurderes samlet.",
  },
  {
    id: "scenario-computer-over-threshold",
    name_nb: "Datautstyr over aktiveringsgrensen",
    keywords: [
      "server",
      "mac pro",
      "arbeidsstasjon",
      "workstation",
      "dyr pc",
      "dyr laptop",
    ],
    typical_accounts: [
      { number: "1280", name: "Kontormaskiner" },
      { number: "1200", name: "Maskiner og anlegg" },
    ],
    vat_treatment: {
      rate: 25,
      code: "1",
      deductible: true,
      notes_nb: "Full MVA-fradrag. MVA beregnes på nettopris.",
    },
    treatment: "capitalize",
    risk_level: "low",
    notes_nb:
      "Datautstyr over kr 15 000 ekskl. MVA med levetid over 3 år " +
      "aktiveres på balansen og avskrives med inntil 30 % (saldogruppe a).",
  },

  // ── Office & supplies ────────────────────────────────────────────────
  {
    id: "scenario-office-supplies",
    name_nb: "Kontorrekvisita",
    keywords: [
      "kontorrekvisita",
      "papir",
      "penn",
      "toner",
      "blekk",
      "konvolutter",
      "binders",
      "mapper",
      "post-it",
      "tape",
      "lim",
      "saks",
      "kontorutstyr",
    ],
    typical_accounts: [{ number: "6800", name: "Kontorrekvisita" }],
    vat_treatment: {
      rate: 25,
      code: "1",
      deductible: true,
      notes_nb: "Standard MVA-fradrag.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb: "Kostnadsføres direkte.",
  },

  // ── Telecom ──────────────────────────────────────────────────────────
  {
    id: "scenario-telecom",
    name_nb: "Telefon og bredbånd",
    keywords: [
      "telefon",
      "mobil",
      "mobilabonnement",
      "bredbaand",
      "internett",
      "fiber",
      "telenor",
      "telia",
      "ice",
      "talkmore",
      "get",
      "altibox",
      "sim",
      "data",
      "telecom",
      "telekommunikasjon",
    ],
    typical_accounts: [
      { number: "6900", name: "Telefon, porto og samband" },
    ],
    vat_treatment: {
      rate: 25,
      code: "1",
      deductible: true,
      notes_nb:
        "Full MVA-fradrag for abonnement brukt i næringsvirksomhet. " +
        "Ved privat bruk av firmamobil: arbeidsgiver må beskatte fordelen, " +
        "men MVA-fradrag er normalt fullt.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb: "Kostnadsføres løpende.",
  },

  // ── Travel ───────────────────────────────────────────────────────────
  {
    id: "scenario-travel",
    name_nb: "Tjenestereise (fly, hotell, transport)",
    keywords: [
      "reise",
      "fly",
      "flybillett",
      "hotell",
      "overnatting",
      "taxi",
      "tog",
      "buss",
      "ferge",
      "leiebil",
      "reiseregning",
      "tjenestereise",
      "flytur",
      "booking",
      "ryanair",
      "norwegian",
      "sas",
      "wideroe",
    ],
    typical_accounts: [
      { number: "7100", name: "Reisekostnad, ikke oppgavepliktig" },
      { number: "7150", name: "Diettkostnad" },
    ],
    vat_treatment: {
      rate: null,
      code: null,
      deductible: true,
      notes_nb:
        "Ulike satser: persontransport 12 %, hotell 12 %, " +
        "drosje/taxi 12 %. Utenlandsreiser: normalt uten norsk MVA. " +
        "Flyreiser innenlands: 12 % MVA.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Reisekostnader kostnadsføres direkte. " +
      "Husk formålsdokumentasjon: formål, reisemål, tidsrom. " +
      "Diett og nattillegg kan være oppgavepliktig (konto 7150).",
  },

  // ── Representation ──────────────────────────────────────────────────
  {
    id: "scenario-representation",
    name_nb: "Representasjon (kundemiddager, gaver)",
    keywords: [
      "representasjon",
      "kundemiddag",
      "forretningslunsj",
      "kundearrangement",
      "gave",
      "forretningsgave",
      "vinmonopolet",
      "restaurant",
      "middag",
      "lunsj",
      "bespisning",
      "kundepleie",
    ],
    typical_accounts: [
      { number: "7350", name: "Representasjon" },
    ],
    vat_treatment: {
      rate: 25,
      code: null,
      deductible: false,
      notes_nb:
        "INGEN MVA-fradrag for representasjon. " +
        "Skattemessig fradrag begrenset til kr 551 per person per tilstelning. " +
        "Dokumentasjonskrav: deltakerliste, formål, sted og dato.",
    },
    treatment: "expense",
    risk_level: "medium",
    notes_nb:
      "Krev alltid dokumentasjon med deltakerliste og forretningsformål. " +
      "Overskytende beløp er ikke fradragsberettiget skattemessig. " +
      "Enkel bevertning (kaffe, kaker) i forbindelse med møter " +
      "regnes IKKE som representasjon og gir fullt MVA-fradrag.",
    conditions_nb:
      "Skillet mellom enkel bevertning og representasjon er viktig. " +
      "Alkohol indikerer normalt representasjon.",
  },

  // ── Employee events & meals ──────────────────────────────────────────
  {
    id: "scenario-employee-welfare",
    name_nb: "Personalarrangement (julebord, sommerfest, ansattmiddag)",
    keywords: [
      "julebord",
      "sommerfest",
      "teambuilding",
      "personalfest",
      "firmafest",
      "ansattarrangement",
      "firmatur",
      "personaltur",
      "sosiale",
      "velferd",
      "ansattmiddag",
    ],
    typical_accounts: [
      { number: "5900", name: "Andre personalkostnader" },
    ],
    vat_treatment: {
      rate: 25,
      code: "1",
      deductible: true,
      notes_nb:
        "MVA-fradrag for rimelige velferdstiltak for alle ansatte. " +
        "Gjelder også alkohol servert ved slike arrangementer.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Velferdsarrangementer for alle ansatte er fradragsberettiget. " +
      "Må være rimelig omfang og inkludere alle/en gruppe ansatte. " +
      "Private arrangementer for enkeltpersoner gir ikke fradrag.",
  },

  // ── Marketing ────────────────────────────────────────────────────────
  {
    id: "scenario-marketing",
    name_nb: "Markedsføring og reklame",
    keywords: [
      "markedsfoering",
      "reklame",
      "annonse",
      "annonsering",
      "google ads",
      "facebook ads",
      "meta ads",
      "instagram",
      "linkedin",
      "sponsing",
      "kampanje",
      "trykksaker",
      "brosjyrer",
      "visittkort",
      "profilering",
      "messe",
      "utstilling",
    ],
    typical_accounts: [
      { number: "7300", name: "Markedsføring og reklame" },
    ],
    vat_treatment: {
      rate: 25,
      code: "1",
      deductible: true,
      notes_nb:
        "Norsk leverandoer: standard MVA-fradrag. " +
        "Utenlandsk leverandoer (Google, Meta): snudd avregning.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Annonse- og markedsfoeringskostnader kostnadsfoeres loepende. " +
      "Storre kampanjer som gaar over flere perioder kan periodiseres.",
  },

  // ── Insurance ────────────────────────────────────────────────────────
  {
    id: "scenario-insurance",
    name_nb: "Forsikring",
    keywords: [
      "forsikring",
      "bedriftsforsikring",
      "innboforsikring",
      "ansvarsforsikring",
      "kasko",
      "reiseforsikring",
      "if",
      "gjensidige",
      "tryg",
      "storebrand",
      "frende",
      "eika",
    ],
    typical_accounts: [
      { number: "7500", name: "Forsikring" },
      { number: "7040", name: "Forsikring bil" },
      { number: "5800", name: "Personalforsikring" },
    ],
    vat_treatment: {
      rate: 0,
      code: null,
      deductible: false,
      notes_nb:
        "Forsikringstjenester er unntatt MVA. " +
        "Ingen MVA paa premien, ingen fradrag.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Aarlige forsikringspremier bor periodiseres om belop er vesentlig. " +
      "Bruk konto 7500 for bedriftsforsikring, " +
      "7040 for bilforsikring, 5800 for personalforsikring.",
  },

  // ── Rent ─────────────────────────────────────────────────────────────
  {
    id: "scenario-rent",
    name_nb: "Husleie",
    keywords: [
      "husleie",
      "leie",
      "kontorlokale",
      "lager",
      "butikklokale",
      "kontorleie",
      "coworking",
      "kontorplass",
    ],
    typical_accounts: [
      { number: "6300", name: "Leie lokaler" },
    ],
    vat_treatment: {
      rate: null,
      code: null,
      deductible: true,
      notes_nb:
        "Husleie kan vaere med eller uten MVA avhengig av om utleier " +
        "er frivillig MVA-registrert. Sjekk faktura. " +
        "Frivillig registrert utleier fakturerer med 25 % MVA.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Kostnadsfoeres loepende per maaned. " +
      "Forskuddsbetalt leie periodiseres.",
  },

  // ── Consulting ───────────────────────────────────────────────────────
  {
    id: "scenario-consulting",
    name_nb: "Konsulenthonorar og fremmedtjenester",
    keywords: [
      "konsulent",
      "raadgiver",
      "advokat",
      "revisor",
      "regnskapsforer",
      "juridisk",
      "raadgivning",
      "honorar",
      "fremmedtjeneste",
      "ekstern bistand",
    ],
    typical_accounts: [
      { number: "6700", name: "Fremmedtjenester" },
    ],
    vat_treatment: {
      rate: 25,
      code: "1",
      deductible: true,
      notes_nb:
        "Norsk leverandoer: 25 % MVA. " +
        "Utenlandsk leverandoer: snudd avregning. " +
        "Juridisk bistand i forbindelse med unntatt virksomhet " +
        "(f.eks. eiendomstransaksjon) kan ha begrenset fradragsrett.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb: "Kostnadsfoeres normalt loepende.",
  },

  // ── Foreign SaaS (reverse charge) ────────────────────────────────────
  {
    id: "scenario-foreign-saas",
    name_nb: "Utenlandsk SaaS / skytjeneste (snudd avregning)",
    keywords: [
      "utenlandsk",
      "foreign",
      "reverse charge",
      "snudd avregning",
      "stripe",
      "paypal",
      "shopify",
      "squarespace",
      "wix",
      "heroku",
      "digitalocean",
      "vercel",
      "netlify",
      "openai",
      "anthropic",
      "chatgpt",
    ],
    typical_accounts: [
      { number: "6560", name: "Programvare" },
      { number: "6700", name: "Fremmedtjenester" },
    ],
    vat_treatment: {
      rate: 25,
      code: null,
      deductible: true,
      notes_nb:
        "Snudd avregning: kjoeper beregner og rapporterer 25 % MVA. " +
        "Faktura fra utenlandsk leverandoer er uten norsk MVA. " +
        "Beregnet MVA foeres som utgaaende MVA og trekkes fra som " +
        "inngaaende MVA (netto null for fullt fradragsberettigede).",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Husk aa rapportere snudd avregning i MVA-meldingen. " +
      "Foeres paa korrekt konto for tjenestetype. " +
      "I PowerOffice: bruk MVA-kode for snudd avregning.",
    conditions_nb:
      "Gjelder fjernleverbare tjenester fra leverandoer uten norsk MVA-registrering.",
  },

  // ── Private expense through company ──────────────────────────────────
  {
    id: "scenario-private-expense",
    name_nb: "Privat kostnad betalt av selskapet",
    keywords: [
      "privat",
      "personlig",
      "aksjonaerlaan",
      "mellomvaerende",
      "privat utlegg",
      "privatbruk",
      "privat kjoep",
    ],
    typical_accounts: [
      { number: "1590", name: "Mellomvaerende med aksjonaer" },
    ],
    vat_treatment: {
      rate: null,
      code: null,
      deductible: false,
      notes_nb:
        "Private kostnader gir IKKE MVA-fradrag. " +
        "Kan ikke kostnadsfoeres i selskapet.",
    },
    treatment: "depends",
    risk_level: "high",
    notes_nb:
      "Private kostnader betalt av selskapet maa behandles som " +
      "aksjonaerlaan eller loenn/utbytte. Aksjonaerlaan har strenge regler " +
      "(rentekrav, nedbetalingsplan). Maa avklares med revisor/regnskapsforer.",
    conditions_nb:
      "ADVARSEL: Feil behandling kan foere til skattemessige konsekvenser " +
      "og tilleggsskatt. Anbefaler aa konsultere regnskapsforer.",
  },

  // ── Vehicle costs ────────────────────────────────────────────────────
  {
    id: "scenario-vehicle",
    name_nb: "Bilkostnader (firmabil)",
    keywords: [
      "bil",
      "firmabil",
      "drivstoff",
      "bensin",
      "diesel",
      "elbil",
      "lading",
      "bom",
      "parkering",
      "bilservice",
      "dekk",
      "bilverksted",
      "billeie",
      "leasing bil",
      "bilforskring",
    ],
    typical_accounts: [
      { number: "7000", name: "Drivstoff, bil" },
      { number: "7020", name: "Vedlikehold bil" },
      { number: "7040", name: "Forsikring bil" },
      { number: "7080", name: "Bilgodtgjoerelse" },
    ],
    vat_treatment: {
      rate: 25,
      code: null,
      deductible: false,
      notes_nb:
        "Personbil (inkl. varebil klasse 1): INGEN MVA-fradrag " +
        "paa anskaffelse eller drift. " +
        "Varebil klasse 2 og lastebil: full MVA-fradrag. " +
        "Elbil: samme regler som oevrige personbiler mht. MVA.",
    },
    treatment: "expense",
    risk_level: "medium",
    notes_nb:
      "Avklar om det er personbil eller yrkesbil for korrekt MVA-behandling. " +
      "Privat bruk av firmabil gir skattepliktig fordel for bruker. " +
      "Kjoerbok anbefales ved blandet bruk.",
    conditions_nb:
      "Type kjoeretoey (personbil vs. varebil klasse 2) " +
      "er avgoerende for MVA-fradragsretten.",
  },

  // ── Work clothing ────────────────────────────────────────────────────
  {
    id: "scenario-work-clothing",
    name_nb: "Arbeidsklaer og verneutstyr",
    keywords: [
      "arbeidsklaer",
      "verneutstyr",
      "uniform",
      "vernesko",
      "hjelm",
      "refleksvest",
      "arbeidsjakke",
      "logo",
      "profilert",
      "verneklaer",
    ],
    typical_accounts: [
      { number: "5900", name: "Andre personalkostnader" },
      { number: "6500", name: "Verktøy, inventar og driftsmaterialer" },
    ],
    vat_treatment: {
      rate: 25,
      code: "1",
      deductible: true,
      notes_nb:
        "MVA-fradrag for arbeidsklaer som er paakrevd i yrket " +
        "eller tydelig merket med firmalogo. " +
        "Vanlige klaer (dress, skjorte) gir normalt ikke fradrag.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Klaer maa vaere yrkespaakrevd eller tydelig firmamerket. " +
      "Vanlige klaer som ogsaa brukes privat er ikke fradragsberettiget.",
    conditions_nb:
      "Skillet mellom arbeidsklaer og privat bekledning er viktig.",
  },

  // ── Subscriptions / memberships ──────────────────────────────────────
  {
    id: "scenario-membership",
    name_nb: "Kontingenter og medlemskap",
    keywords: [
      "kontingent",
      "medlemskap",
      "nho",
      "virke",
      "fagforening",
      "bransjeforening",
      "naeringsforening",
      "handelskammer",
    ],
    typical_accounts: [
      { number: "7400", name: "Kontingenter og gaver" },
    ],
    vat_treatment: {
      rate: 0,
      code: null,
      deductible: false,
      notes_nb:
        "Kontingenter er normalt unntatt MVA. " +
        "Skattemessig fradrag dersom medlemskapet er yrkesrelevant.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb: "Kostnadsfoeres loepende. Ingen MVA paa kontingenter.",
  },

  // ── Bank fees ────────────────────────────────────────────────────────
  {
    id: "scenario-bank-fees",
    name_nb: "Bankgebyr og kortavgifter",
    keywords: [
      "bankgebyr",
      "kortgebyr",
      "betalingsterminal",
      "vipps",
      "nets",
      "bankavgift",
      "transaksjonsgebyr",
      "kortavgift",
      "stripe fee",
    ],
    typical_accounts: [
      { number: "7770", name: "Bank- og kortgebyrer" },
    ],
    vat_treatment: {
      rate: 0,
      code: null,
      deductible: false,
      notes_nb:
        "Finansielle tjenester er unntatt MVA. " +
        "Ingen MVA paa bankgebyrer og kortavgifter.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb: "Kostnadsfoeres loepende. Ingen MVA.",
  },

  // ── Books & publications ─────────────────────────────────────────────
  {
    id: "scenario-books",
    name_nb: "Fagboeker og tidsskrifter",
    keywords: [
      "bok",
      "fagbok",
      "tidsskrift",
      "avis",
      "e-bok",
      "kindle",
      "faglitteratur",
      "abonnement tidsskrift",
      "akademisk",
    ],
    typical_accounts: [
      { number: "7320", name: "Aviser, tidsskrifter, boeker" },
    ],
    vat_treatment: {
      rate: 0,
      code: null,
      deductible: false,
      notes_nb:
        "Boeker og aviser er fritatt for MVA (nullsats). " +
        "E-boeker og elektroniske aviser: nullsats fra 2019.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Kostnadsfoeres direkte. Maa vaere yrkesrelevant for " +
      "skattemessig fradrag.",
  },

  // ── Postage and freight ──────────────────────────────────────────────
  {
    id: "scenario-postage",
    name_nb: "Porto og frakt",
    keywords: [
      "porto",
      "frakt",
      "forsendelse",
      "posten",
      "postnord",
      "bring",
      "pakke",
      "dhl",
      "ups",
      "fedex",
    ],
    typical_accounts: [
      { number: "6800", name: "Kontorrekvisita" },
      { number: "6100", name: "Frakt og transport" },
    ],
    vat_treatment: {
      rate: 25,
      code: "1",
      deductible: true,
      notes_nb:
        "Brevpost: unntatt MVA. Pakkepost: 25 % MVA. " +
        "Utenlandsk frakttjeneste: kan kreve snudd avregning.",
    },
    treatment: "expense",
    risk_level: "low",
    notes_nb:
      "Porto/brevpost paa konto 6800 eller egen underkonto. " +
      "Varetransport paa konto 6100.",
  },
];

// ---------------------------------------------------------------------------
// Scenario matching
// ---------------------------------------------------------------------------

/**
 * Find scenarios that match a given description or vendor name.
 * Returns scenarios sorted by relevance (most keyword matches first).
 */
export function findMatchingScenarios(
  description: string,
  vendorName?: string
): CommonScenario[] {
  const searchText = `${description} ${vendorName ?? ""}`.toLowerCase();

  const scored = COMMON_SCENARIOS.map((scenario) => {
    let score = 0;
    for (const keyword of scenario.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        score += 1;
        // Bonus for longer / more specific keyword matches
        if (keyword.length > 6) score += 0.5;
      }
    }
    return { scenario, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.scenario);
}
