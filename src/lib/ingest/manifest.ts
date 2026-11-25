/**
 * What the importer brings into the archive. Each entry names an English Wikipedia article; the
 * importer reads it through Jina, adds structured facts from Wikidata and writes the result to
 * src/lib/db/seed/imported.json. Editorial hints here are limited to choices a curator makes
 * (dimension, kind, tags, which place represents a tradition, which country to file a record under);
 * facts and text always come from the sources.
 *
 * `geoFrom` names another article whose coordinates locate an item that has none of its own
 * (for example the city most associated with a tradition). `approxGeo` is used only where no
 * article has coordinates and is shown as an approximate location.
 */
import type { Dimension, RecordKind } from "../db/schema";
import type { TaxonGroup } from "./parse";

export type EcosystemKind = "lake" | "forest" | "reef" | "wetland" | "mangrove" | "grassland" | "glacier" | "desert" | "ocean";

interface Common {
  /** English Wikipedia article title (redirects are followed). */
  wiki: string;
  slug?: string;
  countries?: string[];
  geoFrom?: string;
  approxGeo?: [number, number];
}

export interface RecordItem extends Common {
  type: "record";
  dimension: Dimension;
  kind: RecordKind;
  title?: string;
  tags?: string[];
  language?: string;
  species?: string;
  ecosystem?: string;
}
export interface LanguageItem extends Common {
  type: "language";
}
export interface SpeciesItem extends Common {
  type: "species";
  name?: string;
  group?: TaxonGroup;
}
export interface EcosystemItem extends Common {
  type: "ecosystem";
  kind: EcosystemKind;
  name?: string;
}
export type ManifestItem = RecordItem | LanguageItem | SpeciesItem | EcosystemItem;

type Extra = Partial<Omit<RecordItem, "type" | "dimension" | "kind" | "wiki">>;
const record = (dimension: Dimension) => (kind: RecordKind, wiki: string, extra: Extra = {}): RecordItem => ({ type: "record", dimension, kind, wiki, ...extra });
const natural = record("natural");
const cultural = record("cultural");
const historical = record("historical");
const scientific = record("scientific");
const human = record("human");
const language = (wiki: string, extra: Partial<LanguageItem> = {}): LanguageItem => ({ type: "language", wiki, ...extra });
const species = (wiki: string, countries: string[], extra: Partial<SpeciesItem> = {}): SpeciesItem => ({ type: "species", wiki, countries, ...extra });
const ecosystem = (kind: EcosystemKind, wiki: string, extra: Partial<EcosystemItem> = {}): EcosystemItem => ({ type: "ecosystem", kind, wiki, ...extra });

/* ------------------------------------------------------------------ Natural memory */

const NATURAL: RecordItem[] = [
  // Landscapes that hold the planet's memory
  natural("site", "Galápagos Islands", { tags: ["islands", "evolution", "endemic species"] }),
  natural("site", "Yellowstone National Park", { tags: ["national park", "geothermal", "wildlife"] }),
  natural("site", "Hạ Long Bay", { tags: ["karst", "seascape"] }),
  natural("site", "Socotra", { tags: ["islands", "endemic species"] }),
  natural("site", "Namib", { tags: ["desert", "dunes"] }),
  natural("site", "Iguazu Falls", { tags: ["waterfall", "rainforest"] }),
  natural("site", "Victoria Falls", { tags: ["waterfall", "river"] }),
  natural("site", "Virunga National Park", { tags: ["national park", "volcanoes", "wildlife"], species: "mountain-gorilla" }),
  natural("site", "Volcanoes of Kamchatka", { tags: ["volcanoes", "wilderness"], geoFrom: "Kamchatka Peninsula" }),
  natural("site", "Tsingy de Bemaraha Strict Nature Reserve", { tags: ["karst", "endemic species"] }),
  natural("site", "Lord Howe Island", { tags: ["islands", "endemic species"] }),
  natural("site", "Grand Canyon", { tags: ["geology", "deep time"] }),
  // Events remembered in rock, ice and air
  natural("event", "Eruption of Mount Vesuvius in 79 AD", { tags: ["volcanic eruption"] }),
  natural("event", "1755 Lisbon earthquake", { tags: ["earthquake", "tsunami"] }),
  natural("event", "Laki", { tags: ["volcanic eruption", "climate"], title: "Laki fissure eruption" }),
  natural("event", "1815 eruption of Mount Tambora", { tags: ["volcanic eruption", "climate"] }),
  natural("event", "1883 eruption of Krakatoa", { tags: ["volcanic eruption", "tsunami"] }),
  natural("event", "1906 San Francisco earthquake", { tags: ["earthquake"] }),
  natural("event", "Tunguska event", { tags: ["impact event", "forest"] }),
  natural("event", "Dust Bowl", { tags: ["drought", "soil erosion", "climate"], countries: ["US", "CA"], geoFrom: "Oklahoma Panhandle" }),
  natural("event", "Great Smog of London", { tags: ["air pollution"] }),
  natural("event", "Minamata disease", { tags: ["pollution", "mercury"], geoFrom: "Minamata, Kumamoto" }),
  natural("event", "1980 eruption of Mount St. Helens", { tags: ["volcanic eruption", "ecological recovery"] }),
  natural("event", "Lake Nyos disaster", { tags: ["limnic eruption", "lake"] }),
  natural("event", "1991 eruption of Mount Pinatubo", { tags: ["volcanic eruption", "climate"] }),
  natural("event", "2004 Indian Ocean earthquake and tsunami", { tags: ["earthquake", "tsunami"] }),
  natural("event", "Deepwater Horizon oil spill", { tags: ["oil spill", "ocean"] }),
  natural("event", "2011 Tōhoku earthquake and tsunami", { tags: ["earthquake", "tsunami"] }),
  natural("event", "2019–20 Australian bushfire season", { tags: ["wildfire", "climate"], geoFrom: "New South Wales" }),
  // Change observed over decades
  natural("observation", "African humid period", { tags: ["climate", "deep time", "sahara"], geoFrom: "Sahara" }),
  natural("observation", "Ozone depletion", { tags: ["atmosphere", "ozone layer"], geoFrom: "Halley Research Station" }),
  natural("observation", "Larsen Ice Shelf", { tags: ["ice shelf", "climate change"] }),
  natural("observation", "Chacaltaya", { tags: ["glacier loss", "climate change"] }),
  natural("event", "Okjökull", { tags: ["glacier loss", "climate change", "memorial"] }),
  natural("observation", "Chernobyl Exclusion Zone", { tags: ["rewilding", "radiation"], species: "przewalskis-horse" }),
  natural("observation", "Great Pacific garbage patch", { tags: ["plastic pollution", "ocean"], approxGeo: [38, -145] }),
  natural("observation", "Great Green Wall (Africa)", { tags: ["restoration", "desertification"] }),
  natural("observation", "Loess Plateau", { tags: ["restoration", "soil erosion"] }),
  // Individual animals the world remembers
  natural("story", "Martha (pigeon)", { tags: ["extinction", "last of its kind"], species: "passenger-pigeon", geoFrom: "Cincinnati Zoo and Botanical Garden" }),
  natural("story", "Lonesome George", { tags: ["extinction", "last of its kind"], species: "pinta-island-tortoise", countries: ["EC"], geoFrom: "Charles Darwin Research Station" }),
  natural("story", "Sudan (rhinoceros)", { tags: ["extinction", "last of its kind"], species: "northern-white-rhinoceros", geoFrom: "Ol Pejeta Conservancy" }),
  natural("story", "Toughie (frog)", { tags: ["extinction", "last of its kind"], countries: ["US", "PA"], geoFrom: "Atlanta Botanical Garden" }),
];

const ECOSYSTEMS: EcosystemItem[] = [
  ecosystem("wetland", "Okavango Delta"),
  ecosystem("wetland", "Pantanal"),
  ecosystem("wetland", "Everglades"),
  ecosystem("wetland", "Wadden Sea"),
  ecosystem("lake", "Dead Sea"),
  ecosystem("lake", "Lake Urmia"),
  ecosystem("lake", "Lake Poopó"),
  ecosystem("lake", "Great Salt Lake"),
  ecosystem("lake", "Lake Titicaca"),
  ecosystem("lake", "Caspian Sea"),
  ecosystem("reef", "Mesoamerican Barrier Reef System", { countries: ["MX", "BZ", "GT", "HN"] }),
  ecosystem("reef", "Coral Triangle"),
  ecosystem("forest", "Congolian rainforests"),
  ecosystem("forest", "Białowieża Forest"),
  ecosystem("forest", "Daintree Rainforest"),
  ecosystem("desert", "Atacama Desert"),
  ecosystem("grassland", "Serengeti"),
  ecosystem("glacier", "Columbia Glacier (Alaska)", { slug: "columbia-glacier", name: "Columbia Glacier" }),
  ecosystem("glacier", "Aletsch Glacier"),
  ecosystem("glacier", "Jakobshavn Glacier"),
];

const SPECIES: SpeciesItem[] = [
  // Lost species
  species("Thylacine", ["AU"], { geoFrom: "Tasmania" }),
  species("Passenger pigeon", ["US", "CA"], { geoFrom: "Ohio" }),
  species("Dodo", ["MU"], { geoFrom: "Mauritius" }),
  species("Steller's sea cow", ["RU"], { geoFrom: "Commander Islands" }),
  species("Great auk", ["IS", "GB", "CA", "NO"], { geoFrom: "Eldey" }),
  species("Quagga", ["ZA"], { geoFrom: "Karoo" }),
  species("Carolina parakeet", ["US"], { geoFrom: "Florida" }),
  species("Huia", ["NZ"], { geoFrom: "Ruahine Range" }),
  species("Aurochs", ["PL"], { geoFrom: "Jaktorów" }),
  species("Pinta Island tortoise", ["EC"], { geoFrom: "Pinta Island" }),
  species("Golden toad", ["CR"], { geoFrom: "Monteverde Cloud Forest Reserve" }),
  species("Poʻouli", ["US"], { geoFrom: "Haleakalā" }),
  species("Pyrenean ibex", ["ES"], { geoFrom: "Ordesa y Monte Perdido National Park" }),
  species("Western black rhinoceros", ["CM"]),
  species("Bramble Cay melomys", ["AU"], { geoFrom: "Bramble Cay" }),
  // Gone from the wild, or nearly
  species("Baiji", ["CN"], { geoFrom: "Dongting Lake" }),
  species("Spix's macaw", ["BR"], { geoFrom: "Curaçá" }),
  species("Hawaiian crow", ["US"], { geoFrom: "Hawaii (island)" }),
  species("Northern white rhinoceros", ["KE"], { geoFrom: "Ol Pejeta Conservancy" }),
  species("Sophora toromiro", ["CL"], { geoFrom: "Easter Island", name: "Toromiro", slug: "toromiro" }),
  species("Franklinia", ["US"], { geoFrom: "Altamaha River", name: "Franklin tree" }),
  species("Scimitar oryx", ["TD"]),
  // Critically endangered today
  species("Sumatran rhinoceros", ["ID", "MY"], { geoFrom: "Way Kambas National Park" }),
  species("Philippine eagle", ["PH"], { geoFrom: "Mount Apo" }),
  species("Saola", ["VN", "LA"], { geoFrom: "Annamite Range" }),
  species("Kemp's ridley sea turtle", ["MX", "US"], { geoFrom: "Tamaulipas" }),
  species("Chinese giant salamander", ["CN"]),
  species("Squatina squatina", ["ES"], { geoFrom: "Canary Islands", name: "Angelshark", slug: "angelshark" }),
  species("Wollemia", ["AU"], { geoFrom: "Wollemi National Park", name: "Wollemi pine" }),
  species("Ploughshare tortoise", ["MG"]),
  species("Red wolf", ["US"], { geoFrom: "Alligator River National Wildlife Refuge" }),
  species("Lord Howe Island stick insect", ["AU"], { geoFrom: "Ball's Pyramid", name: "Lord Howe Island stick insect" }),
];

/* ------------------------------------------------------------------ Languages of Earth */

const LANGUAGES: LanguageItem[] = [
  language("Ket language"),
  language("Ubykh language", { countries: ["TR"] }),
  language("Aka-Bo language", { countries: ["IN"] }),
  language("Ayapaneco language", { countries: ["MX"] }),
  language("Taushiro language", { countries: ["PE"] }),
  language("Njerep language", { countries: ["NG", "CM"] }),
  language("Ongota language", { countries: ["ET"] }),
  language("Kawésqar language", { countries: ["CL"] }),
  language("Selk'nam language", { countries: ["AR", "CL"] }),
  language("Romansh language", { countries: ["CH"] }),
  language("Sardinian language", { countries: ["IT"] }),
  language("Scottish Gaelic", { countries: ["GB"] }),
  language("Basque language", { countries: ["ES", "FR"] }),
  language("Pite Sámi language", { countries: ["SE"] }),
  language("Nivkh language", { countries: ["RU"] }),
  language("Udege language", { countries: ["RU"] }),
  language("Okinawan language", { countries: ["JP"] }),
  language("Jeju language", { countries: ["KR"] }),
  language("Yuchi language", { countries: ["US"] }),
  language("Cherokee language", { countries: ["US"] }),
  language("Mandan language", { countries: ["US"] }),
  language("Klallam language", { countries: ["US"] }),
  language("Kaurna language", { countries: ["AU"] }),
  language("Rapa Nui language", { countries: ["CL"] }),
  language("Kristang language", { countries: ["MY"], geoFrom: "Malacca City" }),
  language("Tsakonian language", { countries: ["GR"] }),
  language("Wymysorys", { countries: ["PL"] }),
];

/* ------------------------------------------------------------------ Cultural memory */

const CULTURAL: RecordItem[] = [
  cultural("tradition", "Kabuki", { countries: ["JP"], geoFrom: "Kabuki-za", tags: ["theatre", "dance"] }),
  cultural("tradition", "Noh", { countries: ["JP"], geoFrom: "National Noh Theatre", tags: ["theatre", "masks"] }),
  cultural("practice", "Washi", { countries: ["JP"], geoFrom: "Mino, Gifu", tags: ["craft", "paper"] }),
  cultural("tradition", "Kunqu", { countries: ["CN"], geoFrom: "Suzhou", tags: ["opera", "theatre"] }),
  cultural("tradition", "Peking opera", { countries: ["CN"], geoFrom: "Beijing", tags: ["opera", "theatre"] }),
  cultural("tradition", "Guqin", { countries: ["CN"], geoFrom: "Beijing", tags: ["music", "instrument"] }),
  cultural("practice", "Chinese calligraphy", { countries: ["CN"], geoFrom: "Xi'an", tags: ["writing", "art"] }),
  cultural("tradition", "Dragon Boat Festival", { countries: ["CN"], geoFrom: "Miluo River", tags: ["festival"] }),
  cultural("practice", "Kimjang", { countries: ["KR", "KP"], geoFrom: "Seoul", tags: ["food", "community"] }),
  cultural("tradition", "Arirang", { countries: ["KR", "KP"], geoFrom: "Jeongseon County", tags: ["music", "folk song"] }),
  cultural("tradition", "Pansori", { countries: ["KR"], geoFrom: "Jeonju", tags: ["music", "storytelling"] }),
  cultural("tradition", "Naadam", { countries: ["MN"], geoFrom: "Ulaanbaatar", tags: ["festival", "sport"] }),
  cultural("tradition", "Wayang kulit", { countries: ["ID"], geoFrom: "Yogyakarta", tags: ["puppetry", "theatre", "shadow play"] }),
  cultural("tradition", "Gamelan", { countries: ["ID"], geoFrom: "Surakarta", tags: ["music", "ensemble"] }),
  cultural("practice", "Batik", { countries: ["ID"], geoFrom: "Pekalongan", tags: ["craft", "textile"] }),
  cultural("site", "Rice Terraces of the Philippine Cordilleras", { tags: ["cultural landscape", "agriculture", "indigenous"] }),
  cultural("tradition", "Royal Ballet of Cambodia", { countries: ["KH"], geoFrom: "Phnom Penh", tags: ["dance", "court tradition"] }),
  cultural("tradition", "Khmer shadow theatre", { countries: ["KH"], geoFrom: "Siem Reap", tags: ["puppetry", "theatre", "shadow play"] }),
  cultural("tradition", "Kutiyattam", { countries: ["IN"], geoFrom: "Thrissur", tags: ["theatre", "sanskrit"] }),
  cultural("tradition", "Ramlila", { countries: ["IN"], geoFrom: "Varanasi", tags: ["theatre", "epic"] }),
  cultural("tradition", "Kumbh Mela", { countries: ["IN"], geoFrom: "Prayagraj", tags: ["pilgrimage", "festival"] }),
  cultural("tradition", "Kalbelia", { countries: ["IN"], geoFrom: "Jaisalmer", tags: ["dance", "music"] }),
  cultural("tradition", "Mevlevi Order", { countries: ["TR"], geoFrom: "Konya", tags: ["ritual", "music", "sufism"] }),
  cultural("practice", "Turkish coffee", { countries: ["TR"], geoFrom: "Istanbul", tags: ["food", "hospitality"] }),
  cultural("practice", "Neapolitan pizza", { countries: ["IT"], geoFrom: "Naples", tags: ["food", "craft"] }),
  cultural("tradition", "Opera dei Pupi", { countries: ["IT"], geoFrom: "Palermo", tags: ["puppetry", "theatre"] }),
  cultural("tradition", "Carnival of Binche", { countries: ["BE"], geoFrom: "Binche", tags: ["carnival", "masks"] }),
  cultural("tradition", "Flamenco", { countries: ["ES"], geoFrom: "Seville", tags: ["music", "dance"] }),
  cultural("tradition", "Fado", { countries: ["PT"], geoFrom: "Alfama", tags: ["music", "song"] }),
  cultural("tradition", "Cante Alentejano", { countries: ["PT"], geoFrom: "Serpa", tags: ["music", "polyphony"] }),
  cultural("tradition", "Gnawa music", { countries: ["MA"], geoFrom: "Essaouira", tags: ["music", "ritual"] }),
  cultural("tradition", "Ifá", { countries: ["NG"], geoFrom: "Ile-Ife", tags: ["divination", "oral tradition"] }),
  cultural("tradition", "Gelede", { countries: ["BJ", "NG", "TG"], geoFrom: "Kétou", tags: ["masquerade", "ritual"] }),
  cultural("tradition", "Gule Wamkulu", { countries: ["MW", "MZ", "ZM"], geoFrom: "Lilongwe", tags: ["masquerade", "dance"] }),
  cultural("tradition", "Congolese rumba", { countries: ["CD", "CG"], geoFrom: "Kinshasa", tags: ["music", "dance"] }),
  cultural("tradition", "Sega music", { countries: ["MU"], geoFrom: "Port Louis", tags: ["music", "dance"] }),
  cultural("tradition", "Maloya", { countries: ["RE"], geoFrom: "Saint-Denis, Réunion", tags: ["music", "dance"] }),
  cultural("tradition", "Lakalaka", { countries: ["TO"], geoFrom: "Nukuʻalofa", tags: ["dance", "poetry"] }),
  cultural("tradition", "Inuit throat singing", { countries: ["CA"], geoFrom: "Nunavik", tags: ["music", "voice", "indigenous"] }),
  cultural("tradition", "Mariachi", { countries: ["MX"], geoFrom: "Guadalajara", tags: ["music"] }),
  cultural("tradition", "Day of the Dead", { countries: ["MX"], geoFrom: "Pátzcuaro", tags: ["festival", "ancestors"] }),
  cultural("tradition", "Garifuna music", { countries: ["BZ", "HN", "GT", "NI"], geoFrom: "Dangriga", tags: ["music", "dance", "indigenous"] }),
  cultural("tradition", "Reggae", { countries: ["JM"], geoFrom: "Kingston, Jamaica", tags: ["music"] }),
  cultural("tradition", "Vallenato", { countries: ["CO"], geoFrom: "Valledupar", tags: ["music"] }),
  cultural("tradition", "Danza de tijeras", { countries: ["PE"], geoFrom: "Ayacucho", tags: ["dance", "ritual"] }),
  cultural("tradition", "Carnival of Oruro", { countries: ["BO"], geoFrom: "Oruro", tags: ["carnival", "dance"] }),
  cultural("tradition", "Capoeira", { countries: ["BR"], geoFrom: "Salvador, Bahia", tags: ["martial art", "music"] }),
  cultural("tradition", "Samba", { countries: ["BR"], geoFrom: "Rio de Janeiro", tags: ["music", "dance"] }),
];

/* ------------------------------------------------------------------ Historical memory */

const HISTORICAL: RecordItem[] = [
  historical("site", "Göbekli Tepe", { tags: ["archaeology", "neolithic"] }),
  historical("site", "Çatalhöyük", { tags: ["archaeology", "neolithic"] }),
  historical("site", "Lascaux", { tags: ["rock art", "palaeolithic"] }),
  historical("site", "Skara Brae", { tags: ["archaeology", "neolithic"] }),
  historical("site", "Stonehenge", { tags: ["archaeology", "megalith"] }),
  historical("site", "Mohenjo-daro", { tags: ["archaeology", "indus civilisation"] }),
  historical("site", "Knossos", { tags: ["archaeology", "bronze age"] }),
  historical("site", "Babylon", { tags: ["archaeology", "mesopotamia", "city"] }),
  historical("site", "Persepolis", { tags: ["archaeology", "achaemenid empire"] }),
  historical("site", "Caral", { tags: ["archaeology", "andes"] }),
  historical("artifact", "Ötzi", { tags: ["archaeology", "copper age"], countries: ["IT"], geoFrom: "Ötztal Alps" }),
  historical("artifact", "Rosetta Stone", { tags: ["writing", "decipherment"], countries: ["EG", "GB"], geoFrom: "Rosetta" }),
  historical("site", "Library of Alexandria", { tags: ["library", "lost knowledge"], countries: ["EG"], geoFrom: "Alexandria" }),
  historical("site", "Pompeii", { tags: ["archaeology", "roman empire"] }),
  historical("site", "Aksum", { tags: ["archaeology", "city"] }),
  historical("site", "Teotihuacan", { tags: ["archaeology", "city"] }),
  historical("site", "Great Wall of China", { tags: ["architecture", "frontier"] }),
  historical("artifact", "Terracotta Army", { tags: ["archaeology", "qin dynasty"] }),
  historical("site", "Tikal", { tags: ["archaeology", "maya"] }),
  historical("site", "Chichen Itza", { tags: ["archaeology", "maya"] }),
  historical("site", "Borobudur", { tags: ["architecture", "buddhism"] }),
  historical("site", "Buddhas of Bamiyan", { tags: ["destroyed heritage", "buddhism"] }),
  historical("site", "Nan Madol", { tags: ["archaeology", "pacific"] }),
  historical("site", "Rock-Hewn Churches, Lalibela", { tags: ["architecture", "christianity"] }),
  historical("site", "Bagan", { tags: ["architecture", "buddhism"] }),
  historical("site", "Chan Chan", { tags: ["archaeology", "adobe"] }),
  historical("site", "Cahokia", { tags: ["archaeology", "mississippian culture"] }),
  historical("site", "Mesa Verde National Park", { tags: ["archaeology", "ancestral puebloans"] }),
  historical("site", "L'Anse aux Meadows", { tags: ["archaeology", "norse"] }),
  historical("document", "Domesday Book", { tags: ["survey", "manuscript"], geoFrom: "The National Archives (United Kingdom)" }),
  historical("artifact", "Bayeux Tapestry", { tags: ["textile", "embroidery"] }),
  historical("site", "Great Zimbabwe", { tags: ["archaeology", "city"] }),
  historical("site", "Kilwa Kisiwani", { tags: ["swahili coast", "trade"] }),
  historical("site", "Hampi", { tags: ["vijayanagara empire", "city"] }),
  historical("site", "Gorée", { tags: ["atlantic slave trade", "memory"] }),
  historical("site", "Cape Coast Castle", { tags: ["atlantic slave trade", "memory"] }),
  historical("site", "Valongo Wharf", { tags: ["atlantic slave trade", "memory"] }),
  historical("site", "Auschwitz concentration camp", { tags: ["holocaust", "memory"] }),
  historical("site", "Hiroshima Peace Memorial", { tags: ["atomic bombing", "memory"] }),
  historical("site", "Robben Island", { tags: ["apartheid", "memory"] }),
  historical("event", "Chernobyl disaster", { tags: ["nuclear accident", "memory"], countries: ["UA", "BY"] }),
  historical("site", "Palmyra", { tags: ["destroyed heritage", "archaeology"] }),
];

/* ------------------------------------------------------------------ Scientific memory */

const SCIENTIFIC: RecordItem[] = [
  scientific("site", "Laetoli", { tags: ["palaeoanthropology", "footprints"] }),
  scientific("artifact", "Lucy (Australopithecus)", { tags: ["palaeoanthropology", "fossil"], geoFrom: "Hadar, Ethiopia" }),
  scientific("site", "Blombos Cave", { tags: ["archaeology", "symbolic thought"] }),
  scientific("document", "Babylonian astronomical diaries", { tags: ["astronomy", "cuneiform"], countries: ["IQ"], geoFrom: "Babylon" }),
  scientific("artifact", "Nilometer", { tags: ["hydrology", "measurement"], countries: ["EG"], geoFrom: "Roda Island" }),
  scientific("artifact", "Antikythera mechanism", { tags: ["astronomy", "mechanism"] }),
  scientific("document", "Almagest", { tags: ["astronomy", "manuscript"], countries: ["EG"], geoFrom: "Alexandria" }),
  scientific("document", "Dunhuang Star Chart", { tags: ["astronomy", "star chart"], countries: ["CN"], geoFrom: "Mogao Caves" }),
  scientific("site", "Maragheh observatory", { tags: ["astronomy", "observatory"] }),
  scientific("document", "Gutenberg Bible", { tags: ["printing", "book"], countries: ["DE"], geoFrom: "Mainz" }),
  scientific("site", "Uraniborg", { tags: ["astronomy", "observatory"] }),
  scientific("document", "Sidereus Nuncius", { tags: ["astronomy", "telescope"], countries: ["IT"], geoFrom: "Padua" }),
  scientific("site", "Jantar Mantar, Jaipur", { tags: ["astronomy", "instruments"] }),
  scientific("site", "Royal Observatory, Greenwich", { tags: ["astronomy", "timekeeping"] }),
  scientific("document", "Philosophiæ Naturalis Principia Mathematica", { tags: ["physics", "book"], countries: ["GB"], geoFrom: "Trinity College, Cambridge" }),
  scientific("observation", "Central England temperature", { tags: ["climate", "long-term record"], countries: ["GB"], geoFrom: "Met Office" }),
  scientific("research", "Park Grass Experiment", { tags: ["ecology", "long-term experiment"], countries: ["GB"], geoFrom: "Rothamsted Research" }),
  scientific("document", "On the Origin of Species", { tags: ["evolution", "book"], countries: ["GB"], geoFrom: "Down House" }),
  scientific("document", "Experiments on Plant Hybridization", { tags: ["genetics", "paper"], countries: ["CZ"], geoFrom: "Brno" }),
  scientific("research", "Royal Botanic Gardens, Kew", { tags: ["botany", "collections"] }),
  scientific("site", "Bletchley Park", { tags: ["computing", "cryptography"] }),
  scientific("artifact", "ENIAC", { tags: ["computing"], countries: ["US"], geoFrom: "University of Pennsylvania" }),
  scientific("event", "Sputnik 1", { tags: ["spaceflight"], countries: ["KZ", "RU"], geoFrom: "Baikonur Cosmodrome" }),
  scientific("document", "Silent Spring", { tags: ["environment", "book"], countries: ["US"], geoFrom: "Silver Spring, Maryland" }),
  scientific("event", "Apollo 11", { tags: ["spaceflight", "moon"], countries: ["US"], geoFrom: "Kennedy Space Center" }),
  scientific("observation", "Prometheus (tree)", { tags: ["dendrochronology", "ancient trees"] }),
  scientific("artifact", "Voyager Golden Record", { tags: ["spaceflight", "message"], countries: ["US"], geoFrom: "Jet Propulsion Laboratory" }),
  scientific("research", "European Project for Ice Coring in Antarctica", { tags: ["ice core", "climate"], countries: ["AQ"], geoFrom: "Concordia Station" }),
  scientific("research", "Human Genome Project", { tags: ["genetics"], countries: ["US"], geoFrom: "National Institutes of Health" }),
  scientific("observation", "Hubble Deep Field", { tags: ["astronomy", "galaxies"], countries: ["US"], geoFrom: "Space Telescope Science Institute" }),
  scientific("research", "Frozen zoo", { tags: ["biobank", "genetics"], countries: ["US"], geoFrom: "San Diego" }),
  scientific("research", "Millennium Seed Bank Partnership", { tags: ["seed bank", "botany"], countries: ["GB"], geoFrom: "Wakehurst" }),
  scientific("research", "Rosetta Project", { tags: ["language documentation", "long-term archive"], countries: ["US"], geoFrom: "San Francisco" }),
  scientific("research", "Clock of the Long Now", { tags: ["long-term thinking"], countries: ["US"] }),
  scientific("research", "Arctic World Archive", { tags: ["digital preservation", "long-term archive"], countries: ["NO"], geoFrom: "Longyearbyen" }),
];

/* ------------------------------------------------------------------ Human memory */

const HUMAN: RecordItem[] = [
  human("story", "Samuel Pepys", { tags: ["diary", "plague", "great fire"], countries: ["GB"], geoFrom: "Magdalene College, Cambridge" }),
  human("site", "Ellis Island", { tags: ["migration", "family history"] }),
  human("story", "Ishi", { tags: ["indigenous", "last of his people"], countries: ["US"], geoFrom: "Oroville, California" }),
  human("interview", "Federal Writers' Project", { tags: ["oral history", "slave narratives"], countries: ["US"], geoFrom: "Library of Congress" }),
  human("document", "Mass-Observation", { tags: ["everyday life", "diaries"], countries: ["GB"], geoFrom: "The Keep, Brighton" }),
  human("event", "Kindertransport", { tags: ["refugees", "children", "holocaust"], countries: ["GB", "DE", "AT", "CZ"], geoFrom: "Liverpool Street station" }),
  human("document", "The Diary of a Young Girl", { tags: ["diary", "holocaust"], countries: ["NL"], geoFrom: "Anne Frank House" }),
  human("story", "HMT Empire Windrush", { tags: ["migration", "caribbean", "windrush generation"], countries: ["GB", "JM"], geoFrom: "Tilbury" }),
  human("interview", "Hibakusha", { tags: ["testimony", "atomic bombing"], countries: ["JP"], geoFrom: "Hiroshima Peace Memorial Park" }),
  human("site", "Yad Vashem", { tags: ["holocaust", "names", "memorial"] }),
  human("document", "Arolsen Archives", { tags: ["holocaust", "records", "family tracing"], countries: ["DE"], geoFrom: "Bad Arolsen" }),
  human("interview", "Densho", { tags: ["oral history", "incarceration"], countries: ["US"] }),
  human("story", "Mothers of the Plaza de Mayo", { tags: ["the disappeared", "human rights"], countries: ["AR"], geoFrom: "Plaza de Mayo" }),
  human("site", "Vietnam Veterans Memorial", { tags: ["names", "memorial"] }),
  human("artifact", "NAMES Project AIDS Memorial Quilt", { tags: ["aids", "memorial", "textile"], countries: ["US"], geoFrom: "San Francisco" }),
  human("interview", "USC Shoah Foundation", { tags: ["testimony", "holocaust", "video archive"], countries: ["US"], geoFrom: "University of Southern California" }),
  human("interview", "Fortunoff Archive", { tags: ["testimony", "holocaust", "video archive"], countries: ["US"], geoFrom: "Yale University" }),
  human("artifact", "Stolperstein", { tags: ["memorial", "names", "holocaust"], countries: ["DE"], geoFrom: "Cologne" }),
  human("site", "Tuol Sleng Genocide Museum", { tags: ["genocide", "memory"] }),
  human("interview", "Truth and Reconciliation Commission (South Africa)", { tags: ["testimony", "apartheid"], countries: ["ZA"], geoFrom: "Cape Town" }),
  human("site", "Kigali Genocide Memorial", { tags: ["genocide", "memory"] }),
  human("interview", "Voices from Chernobyl", { tags: ["oral history", "nuclear disaster"], countries: ["UA", "BY"], geoFrom: "Pripyat" }),
  human("document", "Memorial (society)", { title: "Memorial (human rights society)", tags: ["gulag", "political repression", "archive"], countries: ["RU"], geoFrom: "Moscow" }),
  human("artifact", "Last Address", { tags: ["memorial", "names", "political repression"], countries: ["RU"], geoFrom: "Moscow" }),
  human("interview", "StoryCorps", { tags: ["oral history", "everyday life"], countries: ["US"], geoFrom: "Grand Central Terminal" }),
  human("document", "Internet Archive", { tags: ["digital preservation", "web archive"], countries: ["US"] }),
  human("interview", "1947 Partition Archive", { tags: ["oral history", "partition"], countries: ["IN", "PK"], geoFrom: "Amritsar" }),
  human("story", "Tevfik Esenç", { tags: ["last speaker", "language death"], countries: ["TR"], language: "ubykh", geoFrom: "Manyas" }),
  human("story", "Boa Sr", { tags: ["last speaker", "language death"], countries: ["IN"], language: "aka-bo", geoFrom: "Strait Island" }),
  human("story", "Edwin Benson", { tags: ["last speaker", "language death"], countries: ["US"], language: "mandan", geoFrom: "Fort Berthold Indian Reservation" }),
  human("story", "Hazel Sampson", { tags: ["last speaker", "language death"], countries: ["US"], language: "klallam", geoFrom: "Port Angeles, Washington" }),
];

export const MANIFEST: ManifestItem[] = [...NATURAL, ...ECOSYSTEMS, ...SPECIES, ...LANGUAGES, ...CULTURAL, ...HISTORICAL, ...SCIENTIFIC, ...HUMAN];
