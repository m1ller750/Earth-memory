import { describe, expect, it } from "vitest";
import {
  articleProse,
  claimIdsWithYear,
  cleanLeadParagraph,
  continuationAfterLead,
  countriesFromText,
  datedObservations,
  formatYear,
  infoboxField,
  iucnFromInfobox,
  languageFamily,
  languageStatusFrom,
  parseCoordinates,
  parseInfobox,
  parseJinaDocument,
  parseWikidataTime,
  speakersNote,
  splitSentences,
  summaryAndBody,
  taxonGroupFrom,
  taxonGroupFromDescription,
  unescoSentence,
  writingSystems,
  type WikidataEntity,
} from "@/lib/ingest/parse";

/* Shapes taken from real responses of Jina's read_url MCP tool (shortened). */
const SPECIES_DOC = `url: https://en.wikipedia.org/wiki/Thylacine
title: Thylacine
content: >-
  | Thylacine Temporal range: Early Pleistocene – Holocene |

  | --- |

  | Conservation status |

  | Extinct(1936) (IUCN 3.1)[2] |

  | Scientific classification |

  | Kingdom: | Animalia |

  | Class: | Mammalia |

  | Binomial name |

  | **†_Thylacinus cynocephalus_** (Harris, 1808)[3] |

  The **thylacine** ( _THY-luh-seen_; _**Thylacinus cynocephalus**_), also
  commonly known as the **Tasmanian tiger**, is an extinct species of
  carnivorous marsupial formerly native to the Australian mainland, Tasmania and New Guinea.

  The last known individual died at Hobart Zoo in Tasmania on 7 September 1936. Intensive searches have
  not found evidence of survival, although unconfirmed sightings continue to be reported.[4]

  1.   ↑"Thylacine". Retrieved 3 May 2020.
`;

const LANGUAGE_DOC = `url: https://en.wikipedia.org/wiki/Ket_language
title: Ket language
content: >-
  | Ket |

  | --- |

  | Native to | Russia |

  | Native speakers | <30(2024)[2] 153 (2020 census)[3] |

  | Language family | Yeniseian * Ketic * **Ket** |

  | Writing system | Cyrillic |

  | ISO 639-3 | \`ket\` |

  | Ket is classified as Severely Endangered by the UNESCO _Atlas of the World's
  Languages in Danger_. |

  The **Ket** language is the sole surviving language of the Yeniseian language family. It is spoken
  along the middle Yenisei basin by the Ket people of Krasnoyarsk Krai in Russia.
`;

describe("Jina documents", () => {
  it("unfolds the YAML block and keeps wrapped table rows together", () => {
    const doc = parseJinaDocument(LANGUAGE_DOC);
    expect(doc.title).toBe("Ket language");
    expect(doc.url).toBe("https://en.wikipedia.org/wiki/Ket_language");
    expect(doc.paragraphs).toContain("| Ket is classified as Severely Endangered by the UNESCO _Atlas of the World's Languages in Danger_. |");
  });

  it("reads language infobox fields", () => {
    const rows = parseInfobox(parseJinaDocument(LANGUAGE_DOC).paragraphs);
    expect(infoboxField(rows, /^native to$/i)).toBe("Russia");
    expect(languageFamily(infoboxField(rows, /^language family$/i))).toBe("Yeniseian, Ketic");
    expect(speakersNote(infoboxField(rows, /^native speakers$/i))).toBe("<30 (2024); 153 (2020 census)");
    expect(writingSystems(infoboxField(rows, /^writing system$/i))).toEqual(["Cyrillic"]);
    expect(languageStatusFrom(unescoSentence(rows))).toBe("severely_endangered");
  });

  it("reads a taxobox: IUCN status with year and taxon group", () => {
    const rows = parseInfobox(parseJinaDocument(SPECIES_DOC).paragraphs);
    expect(iucnFromInfobox(rows)).toMatchObject({ status: "EX", year: 1936, text: "Extinct (1936)" });
    expect(taxonGroupFrom(rows)).toBe("mammal");
  });

  it("falls back to the Wikipedia short description for the taxon group", () => {
    expect(taxonGroupFromDescription("Extinct species of marsupial from Australasia")).toBe("mammal");
    expect(taxonGroupFromDescription("Species of conifer")).toBe("plant");
    expect(taxonGroupFromDescription("Species of stick insect")).toBe("invertebrate");
    expect(taxonGroupFromDescription("Extinct species of bird")).toBe("bird");
    expect(taxonGroupFromDescription("Island")).toBeUndefined();
  });

  it("returns cleaned prose and stops at the reference list", () => {
    const prose = articleProse(parseJinaDocument(SPECIES_DOC).paragraphs);
    expect(prose).toHaveLength(2);
    expect(prose[0]).toMatch(/^The thylacine \(THY-luh-seen; Thylacinus cynocephalus\), also commonly known as the Tasmanian tiger/);
    expect(prose.join(" ")).not.toMatch(/\[\d\]|Retrieved/);
  });
});

describe("lead text", () => {
  it("removes pronunciation guides but keeps native and scientific names", () => {
    expect(cleanLeadParagraph("The thylacine ( THY-luh-seen; Thylacinus cynocephalus), also known as the Tasmanian tiger, is extinct.")).toBe(
      "The thylacine (Thylacinus cynocephalus), also known as the Tasmanian tiger, is extinct.",
    );
    expect(cleanLeadParagraph("The Namib (NAH-mib; Portuguese: Namibe) is a coastal desert in Southern Africa.")).toBe("The Namib (Portuguese: Namibe) is a coastal desert in Southern Africa.");
    expect(cleanLeadParagraph("Kabuki (歌舞伎; Japanese pronunciation: [ka.bɯ.kʲi]) is a classical form of Japanese theatre.")).toBe(
      "Kabuki (歌舞伎) is a classical form of Japanese theatre.",
    );
    expect(cleanLeadParagraph("The Ket ( KET) language is the sole surviving Yeniseian language.")).toBe("The Ket language is the sole surviving Yeniseian language.");
    expect(cleanLeadParagraph("The African humid period (AHP; also known by other names) was a climate period.")).toBe(
      "The African humid period (AHP; also known by other names) was a climate period.",
    );
  });

  it("tidies pronunciation leftovers found in real leads", () => {
    const cases: Array<[string, string]> = [
      ["Mariachi (US:, UK:, Spanish:) is a genre of regional Mexican music.", "Mariachi is a genre of regional Mexican music."],
      ["Lascaux (English: la-SKOH, US also lah-SKOH; French: Grotte de Lascaux) is a network of caves.", "Lascaux (French: Grotte de Lascaux) is a network of caves."],
      ["\"Ötzi\" (German:; c. 3275 BC – c. 3230 BC), also called the Iceman, is a mummy.", "\"Ötzi\" (c. 3275 BC – c. 3230 BC), also called the Iceman, is a mummy."],
      ["Edwin James Benson ((1931-10-23)October 23, 1931 – (2016-12-09)December 9, 2016) was a Mandan speaker.", "Edwin James Benson (October 23, 1931 – December 9, 2016) was a Mandan speaker."],
      ["The Antikythera mechanism ( AN-tik-ih-THEER-ə, US also AN-ty-kih-) is an Ancient Greek hand-powered model.", "The Antikythera mechanism is an Ancient Greek hand-powered model."],
      ["Göbekli Tepe (pronounced ɟœbecˈli teˈpe meaning 'Potbelly Hill') is a Neolithic site.", "Göbekli Tepe (meaning 'Potbelly Hill') is a Neolithic site."],
      ["Lake Nyos killed 1,746 people (about 1,746 in total, as reported) in 1986.", "Lake Nyos killed 1,746 people (about 1,746 in total, as reported) in 1986."],
    ];
    for (const [input, expected] of cases) expect(cleanLeadParagraph(input)).toBe(expected);
  });

  it("splits sentences without breaking on abbreviations or initials", () => {
    expect(splitSentences("It was built c. 1500 by St. Louis and J. R. Smith. Then it fell. Finally, it was restored.")).toEqual([
      "It was built c. 1500 by St. Louis and J. R. Smith.",
      "Then it fell.",
      "Finally, it was restored.",
    ]);
  });

  it("builds a summary and a body that does not repeat it", () => {
    const lead = [
      "Martha (c. 1885 – September 1, 1914) was a passenger pigeon, the last known of her species.",
      "She was named after Martha Washington. Her body was frozen and sent to the Smithsonian Institution.",
    ];
    const continuation = ["Martha (c.1885 – September 1, 1914) was a passenger pigeon, the last known of her species, as recorded by the zoo.", "Martha lived at the Cincinnati Zoo for most of her life and was viewed by many visitors who came to see the last of her kind."];
    const { summary, body } = summaryAndBody(lead, continuation, { minBody: 400 });
    expect(summary).toBe(lead[0]);
    expect(body.startsWith("She was named after Martha Washington.")).toBe(true);
    expect(body).toContain("Cincinnati Zoo");
    expect(body).not.toContain("the last known of her species");
  });

  it("finds the paragraphs that follow the lead despite spacing differences", () => {
    const prose = ["Martha (c.1885 – September 1, 1914) was a passenger pigeon.", "Next paragraph about the zoo and its visitors in the early twentieth century."];
    expect(continuationAfterLead(prose, ["Martha (c. 1885 – September 1, 1914) was a passenger pigeon."])).toEqual([prose[1]]);
  });
});

describe("observations, places and dates", () => {
  it("selects dated statements about change, verbatim", () => {
    const prose = [
      "The lake covered about 25,000 square kilometres in 1963. By 2001 the open water had shrunk to a fraction of that area because of drought and irrigation.",
      "The basin was designated a Ramsar site in 2001 and local programmes now monitor water levels every year with satellite images.",
      "Fishing communities have lived here for centuries and trade dried fish across the region in large markets.",
    ];
    const observations = datedObservations(prose, { currentYear: 2026 });
    expect(observations.map((o) => [o.year, o.title])).toEqual([
      [2001, "Water loss"],
      [2001, "Protection"],
    ]);
    expect(observations[0].observation).toBe(prose[0].split(". ")[1]);
  });

  it("parses decimal coordinates from an infobox value", () => {
    expect(parseCoordinates("19°24′S 22°54′E / 19.400°S 22.900°E")).toEqual({ lat: -19.4, lng: 22.9 });
    expect(parseCoordinates("no coordinates here")).toBeUndefined();
  });

  it("maps country names to ISO codes", () => {
    expect(countriesFromText("Russia, Turkey and Georgia")).toEqual(["RU", "TR", "GE"]);
  });

  it("reads Wikidata times, including BCE years and coarse precision", () => {
    expect(parseWikidataTime({ time: "-0700-00-00T00:00:00Z", precision: 7 })).toEqual({ year: -700, precision: 7 });
    expect(formatYear({ year: -700, precision: 7 })).toBe("c. 700 BCE");
    expect(formatYear(1958)).toBe("1958");
  });

  it("reads designation claims with their start-time qualifier", () => {
    const entity: WikidataEntity = {
      id: "Q1",
      claims: {
        P1435: [
          {
            rank: "normal",
            mainsnak: { snaktype: "value", datavalue: { type: "wikibase-entityid", value: { id: "Q9259" } } },
            qualifiers: { P580: [{ snaktype: "value", datavalue: { type: "time", value: { time: "+1985-00-00T00:00:00Z", precision: 9 } } }] },
          },
          { rank: "deprecated", mainsnak: { snaktype: "value", datavalue: { type: "wikibase-entityid", value: { id: "Q2" } } } },
        ],
      },
    };
    expect(claimIdsWithYear(entity, "P1435")).toEqual([{ id: "Q9259", year: 1985 }]);
  });
});
