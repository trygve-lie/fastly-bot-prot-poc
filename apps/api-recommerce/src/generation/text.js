import { createHash } from 'node:crypto';

// Product catalogue keyed by subcategory. Each entry is a brand (or null for
// unbranded goods) and display names ordered roughly from cheapest to most
// expensive — the generator uses the position as a price hint.
const PRODUCT_CATALOG = {
  // electronics
  phone: [
    { brand: 'Apple', models: ['iPhone 11 64 GB', 'iPhone 12 128 GB', 'iPhone 13 128 GB', 'iPhone 14 128 GB', 'iPhone 15 Pro 256 GB'] },
    { brand: 'Samsung', models: ['Galaxy A54', 'Galaxy S21', 'Galaxy S23', 'Galaxy Z Flip5'] },
    { brand: 'Google', models: ['Pixel 7a', 'Pixel 8'] },
  ],
  tablet: [
    { brand: 'Apple', models: ['iPad 9th generation', 'iPad Air', 'iPad Pro 11'] },
    { brand: 'Samsung', models: ['Galaxy Tab A8', 'Galaxy Tab S8'] },
    { brand: 'Lenovo', models: ['Tab M10', 'Tab P11'] },
  ],
  camera: [
    { brand: 'Canon', models: ['EOS 250D', 'EOS R6'] },
    { brand: 'Sony', models: ['Alpha 6400', 'Alpha 7 III'] },
    { brand: 'Fujifilm', models: ['X-T30', 'X100V', 'X-T4'] },
    { brand: 'Nikon', models: ['Z50', 'D750'] },
  ],
  headphones: [
    { brand: 'Bose', models: ['QuietComfort 35 II', 'QuietComfort 45'] },
    { brand: 'Sony', models: ['WH-1000XM4', 'WH-1000XM5'] },
    { brand: 'Apple', models: ['AirPods 3rd generation', 'AirPods Pro', 'AirPods Max'] },
    { brand: 'Sennheiser', models: ['HD 560S', 'Momentum 4'] },
  ],
  speaker: [
    { brand: 'JBL', models: ['Flip 6', 'Charge 5'] },
    { brand: 'Bose', models: ['SoundLink Flex', 'Home Speaker 500'] },
    { brand: 'Sonos', models: ['One SL', 'Move', 'Five'] },
  ],
  tv: [
    { brand: 'Samsung', models: ['55 inch Crystal UHD TV', '65 inch QLED TV'] },
    { brand: 'Sony', models: ['55 inch Bravia X80 TV', '65 inch Bravia A80 OLED TV'] },
    { brand: 'LG', models: ['55 inch OLED C2 TV', '65 inch OLED C3 TV'] },
  ],
  smartwatch: [
    { brand: 'Apple', models: ['Watch SE', 'Watch Series 8'] },
    { brand: 'Garmin', models: ['Forerunner 255', 'Fenix 7'] },
    { brand: 'Samsung', models: ['Galaxy Watch5'] },
  ],
  // computers & gaming
  laptop: [
    { brand: 'Lenovo', models: ['IdeaPad 5', 'ThinkPad T14', 'Yoga Slim 7'] },
    { brand: 'Apple', models: ['MacBook Air M1', 'MacBook Air M2', 'MacBook Pro 14'] },
    { brand: 'Asus', models: ['ZenBook 14', 'ROG Zephyrus G14'] },
    { brand: 'Dell', models: ['Inspiron 15', 'XPS 13'] },
  ],
  desktop: [
    { brand: 'Lenovo', models: ['ThinkCentre M70', 'Legion Tower 5'] },
    { brand: 'Apple', models: ['Mac mini M2', 'iMac 24'] },
    { brand: 'HP', models: ['Pavilion Desktop', 'Omen 25L'] },
  ],
  monitor: [
    { brand: 'BenQ', models: ['GW2780 monitor', 'PD2705Q monitor'] },
    { brand: 'Samsung', models: ['Odyssey G5 27 inch monitor'] },
    { brand: 'Dell', models: ['S2721DGF monitor', 'UltraSharp U2723QE monitor'] },
    { brand: 'LG', models: ['27GN800 monitor', 'UltraFine 4K monitor'] },
  ],
  game_console: [
    { brand: 'Nintendo', models: ['Switch Lite', 'Switch', 'Switch OLED'] },
    { brand: 'Sony', models: ['PlayStation 4 Pro', 'PlayStation 5'] },
    { brand: 'Microsoft', models: ['Xbox Series S', 'Xbox Series X'] },
  ],
  video_game: [
    { brand: 'Nintendo', models: ['Mario Kart 8 Deluxe', 'Animal Crossing New Horizons', 'Zelda Tears of the Kingdom'] },
    { brand: 'Sony', models: ['Horizon Forbidden West', 'God of War Ragnarok', 'Spider-Man 2'] },
    { brand: 'EA', models: ['FC 24', 'Star Wars Jedi Survivor'] },
  ],
  keyboard: [
    { brand: 'Logitech', models: ['K380 keyboard', 'MX Keys keyboard', 'G915 keyboard'] },
    { brand: 'Corsair', models: ['K70 keyboard'] },
    { brand: 'Razer', models: ['BlackWidow V3 keyboard'] },
  ],
  // home appliances
  coffee_machine: [
    { brand: 'Nespresso', models: ['Vertuo Next', 'Lattissima One'] },
    { brand: 'Moccamaster', models: ['Cup-One', 'KBG Select'] },
    { brand: 'Philips', models: ['LatteGo 2200', 'LatteGo 3200'] },
    { brand: "De'Longhi", models: ['Dedica EC685', 'Magnifica S'] },
  ],
  vacuum_cleaner: [
    { brand: 'Electrolux', models: ['Pure Q9', 'UltimateHome 700'] },
    { brand: 'Dyson', models: ['V8', 'V11', 'V15 Detect'] },
    { brand: 'Miele', models: ['Complete C3'] },
    { brand: 'iRobot', models: ['Roomba i7'] },
  ],
  washing_machine: [
    { brand: 'Samsung', models: ['EcoBubble 8 kg washing machine'] },
    { brand: 'Electrolux', models: ['PerfectCare 700 washing machine'] },
    { brand: 'Bosch', models: ['Serie 4 washing machine', 'Serie 6 washing machine'] },
    { brand: 'Miele', models: ['WCD 330 washing machine'] },
  ],
  microwave: [
    { brand: 'Whirlpool', models: ['MWP 253 microwave'] },
    { brand: 'Electrolux', models: ['EMS2085 microwave'] },
    { brand: 'Samsung', models: ['MS23K3515 microwave'] },
    { brand: 'Bosch', models: ['Serie 2 microwave'] },
  ],
  stand_mixer: [
    { brand: 'Bosch', models: ['MUM5 kitchen machine'] },
    { brand: 'Kenwood', models: ['Chef XL'] },
    { brand: 'KitchenAid', models: ['Classic 5K45', 'Artisan 5KSM175'] },
  ],
  dishwasher: [
    { brand: 'Electrolux', models: ['ComfortLift dishwasher'] },
    { brand: 'Bosch', models: ['Serie 4 dishwasher'] },
    { brand: 'Siemens', models: ['iQ300 dishwasher'] },
    { brand: 'Miele', models: ['G 5110 dishwasher'] },
  ],
  // furniture
  sofa: [
    { brand: 'IKEA', models: ['Ektorp 2-seat sofa', 'Kivik 3-seat sofa', 'Söderhamn 3-seat sofa'] },
    { brand: 'Bolia', models: ['Scandinavia 3-seat sofa', 'Cosima 3-seat sofa'] },
    { brand: 'Hay', models: ['Mags 2.5-seat sofa'] },
    { brand: 'BoConcept', models: ['Osaka 3-seat sofa'] },
  ],
  armchair: [
    { brand: 'IKEA', models: ['Poäng armchair', 'Strandmon wing chair'] },
    { brand: 'Hay', models: ['Mags lounge chair'] },
    { brand: 'Ekornes', models: ['Stressless Mayfair recliner'] },
    { brand: 'Fritz Hansen', models: ['Swan chair', 'Egg chair'] },
  ],
  dining_table: [
    { brand: null, models: ['Pine farmhouse dining table', 'Oak dining table'] },
    { brand: 'IKEA', models: ['Lisabo dining table', 'Ekedalen extendable dining table'] },
    { brand: 'Bolia', models: ['Graceful dining table'] },
    { brand: 'Hay', models: ['CPH30 dining table'] },
  ],
  chair: [
    { brand: 'IKEA', models: ['Ingolf chair', 'Odger chair'] },
    { brand: null, models: ['Bentwood cafe chair'] },
    { brand: 'Hay', models: ['About A Chair AAC22'] },
    { brand: 'Fritz Hansen', models: ['Ant chair', 'Series 7 chair'] },
    { brand: 'Herman Miller', models: ['Aeron office chair'] },
  ],
  bookshelf: [
    { brand: 'IKEA', models: ['Billy bookcase', 'Hemnes bookcase', 'Kallax shelf unit 4x4'] },
    { brand: 'String', models: ['String Pocket shelf', 'String System shelf'] },
    { brand: 'Montana', models: ['Montana shelving module'] },
  ],
  bed: [
    { brand: 'IKEA', models: ['Malm bed frame 160x200', 'Hemnes bed frame 160x200'] },
    { brand: 'Wonderland', models: ['Continental bed 160x200'] },
    { brand: 'Jensen', models: ['Ambassador continental bed 180x200'] },
  ],
  desk: [
    { brand: 'IKEA', models: ['Micke desk', 'Alex desk', 'Bekant desk'] },
    { brand: null, models: ['Teak writing desk'] },
    { brand: 'Hay', models: ['CPH90 desk'] },
  ],
  wardrobe: [
    { brand: 'IKEA', models: ['Brimnes wardrobe', 'Pax wardrobe'] },
    { brand: null, models: ['Pine wardrobe', 'Painted farmhouse wardrobe'] },
  ],
  // home decor
  lamp: [
    { brand: 'IKEA', models: ['Skurup pendant lamp', 'Ranarp floor lamp'] },
    { brand: null, models: ['Brass reading lamp'] },
    { brand: 'Northern', models: ['Buddy table lamp'] },
    { brand: 'Hay', models: ['Pao pendant lamp'] },
    { brand: 'Louis Poulsen', models: ['Panthella table lamp', 'PH 5 pendant lamp'] },
  ],
  rug: [
    { brand: 'IKEA', models: ['Stockholm rug 170x240'] },
    { brand: null, models: ['Wool kilim rug', 'Persian rug 200x300'] },
    { brand: 'Ferm Living', models: ['Way rug'] },
    { brand: 'Hay', models: ['Bias rug'] },
  ],
  vase: [
    { brand: null, models: ['Ceramic vase'] },
    { brand: 'Hadeland Glassverk', models: ['Glass vase'] },
    { brand: 'Kähler', models: ['Hammershøi vase'] },
    { brand: 'Iittala', models: ['Aalto vase'] },
  ],
  mirror: [
    { brand: 'IKEA', models: ['Lindbyn mirror', 'Hovet mirror'] },
    { brand: 'Ferm Living', models: ['Pond mirror'] },
    { brand: null, models: ['Gilded wall mirror'] },
  ],
  candle_holder: [
    { brand: null, models: ['Brass candle holders', 'Pewter candle holders'] },
    { brand: 'Kähler', models: ['Urbania candle holder'] },
    { brand: 'Hay', models: ['Moonlit candle holder'] },
    { brand: 'Georg Jensen', models: ['Alfredo candle holder'] },
  ],
  figurine: [
    { brand: null, models: ['Ceramic troll figurine', 'Carved wooden moose'] },
    { brand: 'Porsgrund', models: ['Porcelain bird figurine'] },
    { brand: 'Kay Bojesen', models: ['Wooden monkey'] },
    { brand: 'Royal Copenhagen', models: ['Porcelain figurine'] },
  ],
  picture_frame: [
    { brand: 'IKEA', models: ['Ribba frame 50x70'] },
    { brand: null, models: ['Oak picture frame', 'Gold picture frame'] },
  ],
  // clothing
  jacket: [
    { brand: 'Helly Hansen', models: ['Crew sailing jacket', 'Odin mountain jacket'] },
    { brand: 'Fjällräven', models: ['Greenland jacket', 'Keb jacket'] },
    { brand: 'Bergans', models: ['Senja jacket', 'Romsdal 3L jacket'] },
    { brand: 'Patagonia', models: ['Nano Puff jacket'] },
    { brand: 'Norrøna', models: ['Falketind Gore-Tex jacket'] },
  ],
  coat: [
    { brand: 'Arket', models: ['Wool coat'] },
    { brand: 'COS', models: ['Wool overcoat'] },
    { brand: 'Helly Hansen', models: ['Aden long coat'] },
    { brand: 'Fjällräven', models: ['Expedition down parka'] },
    { brand: 'Canada Goose', models: ['Expedition parka'] },
  ],
  sweater: [
    { brand: 'Arket', models: ['Merino sweater'] },
    { brand: 'Devold', models: ['Nansen sweater'] },
    { brand: 'Ralph Lauren', models: ['Cable knit sweater'] },
    { brand: 'Dale of Norway', models: ['Wool sweater'] },
  ],
  jeans: [
    { brand: "Levi's", models: ['511 slim jeans', '501 jeans'] },
    { brand: 'Nudie Jeans', models: ['Lean Dean jeans'] },
    { brand: 'Acne Studios', models: ['1996 jeans'] },
  ],
  dress: [
    { brand: 'H&M', models: ['Satin midi dress'] },
    { brand: 'Samsøe Samsøe', models: ['Willow dress'] },
    { brand: 'Ganni', models: ['Printed wrap dress'] },
    { brand: 'By Malene Birger', models: ['Silk dress'] },
  ],
  shirt: [
    { brand: 'Arket', models: ['Linen shirt'] },
    { brand: 'Tommy Hilfiger', models: ['Poplin shirt'] },
    { brand: 'Ralph Lauren', models: ['Oxford shirt'] },
  ],
  // shoes & accessories
  sneakers: [
    { brand: 'Nike', models: ['Air Force 1', 'Dunk Low', 'Air Max 90'] },
    { brand: 'Adidas', models: ['Stan Smith', 'Samba', 'Ultraboost'] },
    { brand: 'New Balance', models: ['574', '990v5'] },
  ],
  boots: [
    { brand: 'Ecco', models: ['Track 25 boots'] },
    { brand: 'Dr. Martens', models: ['1460 boots'] },
    { brand: 'Timberland', models: ['6-inch premium boots'] },
    { brand: 'Sorel', models: ['Caribou boots'] },
  ],
  handbag: [
    { brand: 'Rains', models: ['Weekend bag'] },
    { brand: 'Michael Kors', models: ['Jet Set tote'] },
    { brand: 'Coach', models: ['Tabby shoulder bag'] },
    { brand: 'Mulberry', models: ['Bayswater bag'] },
    { brand: 'Louis Vuitton', models: ['Neverfull MM'] },
  ],
  watch: [
    { brand: 'Casio', models: ['G-Shock GA-2100'] },
    { brand: 'Seiko', models: ['5 Sports', 'Presage'] },
    { brand: 'Tissot', models: ['PRX'] },
    { brand: 'Omega', models: ['Seamaster Diver 300M'] },
  ],
  sunglasses: [
    { brand: 'Ray-Ban', models: ['Wayfarer', 'Aviator'] },
    { brand: 'Oakley', models: ['Holbrook'] },
    { brand: 'Persol', models: ['PO0714'] },
  ],
  jewellery: [
    { brand: null, models: ['Silver ring', 'Gold earrings'] },
    { brand: 'Pandora', models: ['Charm bracelet'] },
    { brand: 'David-Andersen', models: ['Enamel pendant'] },
    { brand: 'Georg Jensen', models: ['Silver necklace'] },
  ],
  // kids & baby
  stroller: [
    { brand: 'Babyzen', models: ['Yoyo2'] },
    { brand: 'Emmaljunga', models: ['NXT90'] },
    { brand: 'Bugaboo', models: ['Cameleon 3', 'Fox 3'] },
    { brand: 'Stokke', models: ['Trailz', 'Xplory'] },
  ],
  car_seat: [
    { brand: 'Axkid', models: ['Minikid 2'] },
    { brand: 'Britax Römer', models: ['Dualfix'] },
    { brand: 'Cybex', models: ['Cloud Z'] },
    { brand: 'BeSafe', models: ['iZi Go Modular', 'iZi Modular'] },
  ],
  high_chair: [
    { brand: 'IKEA', models: ['Antilop high chair'] },
    { brand: 'BabyBjörn', models: ['High Chair'] },
    { brand: 'Stokke', models: ['Tripp Trapp'] },
  ],
  toy: [
    { brand: 'Fisher-Price', models: ['Activity center'] },
    { brand: 'Playmobil', models: ['Farm set'] },
    { brand: 'LEGO', models: ['Duplo box'] },
    { brand: 'Brio', models: ['Wooden railway set'] },
  ],
  kids_clothing: [
    { brand: 'Name It', models: ['Kids jeans'] },
    { brand: 'Molo', models: ['Kids jacket'] },
    { brand: 'Polarn O. Pyret', models: ['Wool base layer set'] },
    { brand: 'Reima', models: ['Rain set', 'Winter overall'] },
  ],
  crib: [
    { brand: 'IKEA', models: ['Sundvik cot'] },
    { brand: 'Leander', models: ['Classic baby cot'] },
    { brand: 'Stokke', models: ['Sleepi cot'] },
  ],
  // sports & outdoors
  bicycle: [
    { brand: 'DBS', models: ['Intruder bike'] },
    { brand: 'Cube', models: ['Kathmandu Hybrid e-bike'] },
    { brand: 'Specialized', models: ['Rockhopper bike', 'Allez road bike'] },
    { brand: 'Trek', models: ['FX 3 bike', 'Marlin 7 bike', 'Domane AL 2 road bike'] },
  ],
  skis: [
    { brand: 'Madshus', models: ['Redline classic skis', 'Race Speed skate skis'] },
    { brand: 'Fischer', models: ['Speedmax skis', 'Ranger 96 skis'] },
    { brand: 'Atomic', models: ['Bent 100 skis', 'Redster skis'] },
    { brand: 'Rossignol', models: ['Experience 86 skis'] },
  ],
  snowboard: [
    { brand: 'Burton', models: ['Process snowboard', 'Custom snowboard'] },
    { brand: 'Lib Tech', models: ['Skate Banana snowboard'] },
    { brand: 'Jones', models: ['Mountain Twin snowboard'] },
  ],
  tent: [
    { brand: 'MSR', models: ['Hubba Hubba NX tent'] },
    { brand: 'Helsport', models: ['Fjellheimen 3 tent'] },
    { brand: 'Nordisk', models: ['Asgard 7.1 tent'] },
    { brand: 'Hilleberg', models: ['Akto tent', 'Nallo 2 tent', 'Kaitum 3 tent'] },
  ],
  running_shoes: [
    { brand: 'Nike', models: ['Pegasus 40'] },
    { brand: 'Brooks', models: ['Ghost 15'] },
    { brand: 'Hoka', models: ['Clifton 9'] },
    { brand: 'Asics', models: ['Gel-Nimbus 25', 'Gel-Kayano 30'] },
  ],
  gym_equipment: [
    { brand: null, models: ['Kettlebell set', 'Adjustable weight bench'] },
    { brand: 'Bowflex', models: ['SelectTech 552 dumbbells'] },
    { brand: 'Concept2', models: ['RowErg rowing machine'] },
  ],
  golf_clubs: [
    { brand: 'Callaway', models: ['Rogue ST iron set'] },
    { brand: 'Ping', models: ['G430 driver'] },
    { brand: 'TaylorMade', models: ['Stealth driver'] },
    { brand: 'Titleist', models: ['T200 iron set'] },
  ],
  // hobbies & music
  guitar: [
    { brand: 'Yamaha', models: ['FG800 acoustic guitar', 'Pacifica 112V guitar'] },
    { brand: 'Fender', models: ['Player Jazz Bass', 'Player Telecaster', 'American Stratocaster'] },
    { brand: 'Gibson', models: ['SG Standard', 'Les Paul Standard'] },
    { brand: 'Martin', models: ['D-28 acoustic guitar'] },
  ],
  keyboard_instrument: [
    { brand: 'Yamaha', models: ['PSR-E373 keyboard', 'P-45 digital piano'] },
    { brand: 'Korg', models: ['Minilogue synthesizer'] },
    { brand: 'Roland', models: ['FP-30X digital piano'] },
    { brand: 'Nord', models: ['Stage 3 piano'] },
  ],
  drum_kit: [
    { brand: 'Pearl', models: ['Export drum kit'] },
    { brand: 'Yamaha', models: ['Stage Custom drum kit'] },
    { brand: 'Roland', models: ['TD-17 electronic drum kit'] },
  ],
  board_game: [
    { brand: null, models: ['Wooden chess set'] },
    { brand: 'Hasbro', models: ['Cluedo', 'Monopoly'] },
    { brand: 'Kosmos', models: ['Catan'] },
    { brand: 'Days of Wonder', models: ['Ticket to Ride'] },
  ],
  sewing_machine: [
    { brand: 'Singer', models: ['Heavy Duty 4423 sewing machine'] },
    { brand: 'Brother', models: ['Innov-is A16 sewing machine'] },
    { brand: 'Husqvarna Viking', models: ['Opal 690Q sewing machine'] },
    { brand: 'Bernina', models: ['B 335 sewing machine'] },
  ],
  lego_set: [
    { brand: 'LEGO', models: ['City Fire Station', 'Star Wars X-Wing', 'Creator Ferris Wheel', 'Technic Porsche 911', 'Millennium Falcon 75192'] },
  ],
  // books & media
  book: [
    { brand: null, models: ['Paperback novel', 'Crime novel collection', 'Travel guide', 'Hardcover novel', 'Cookbook'] },
  ],
  vinyl_record: [
    { brand: null, models: ['Soundtrack LP', 'Norwegian folk LP', '1970s pop LP', 'Classic rock LP', 'Jazz LP'] },
  ],
  comic: [
    { brand: null, models: ['Donald Duck pocket book', 'Pondus album', 'Asterix album', 'Tintin album', 'Marvel comic bundle'] },
  ],
  film: [
    { brand: null, models: ['DVD collection', '4K Blu-ray film', 'Blu-ray box set'] },
  ],
  textbook: [
    { brand: null, models: ['Economics textbook', 'Nursing textbook', 'Law textbook', 'University textbook'] },
  ],
  // antiques & collectibles
  wall_clock: [
    { brand: null, models: ['Brass wall clock', 'Oak regulator clock', 'Mora wall clock', 'Gustavian long-case clock'] },
  ],
  coin: [
    { brand: null, models: ['Silver krone coin', 'Commemorative silver coin', 'Coin collection album', 'Norwegian 20-krone gold coin'] },
  ],
  stamp: [
    { brand: null, models: ['Vintage stamp album', 'Post horn stamp series', 'Norwegian stamp collection'] },
  ],
  painting: [
    { brand: null, models: ['Framed etching', 'Coastal watercolour', 'Signed lithograph', 'Landscape oil painting'] },
  ],
  porcelain: [
    { brand: 'Figgjo', models: ['Lotte coffee set'] },
    { brand: 'Arabia', models: ['Paratiisi plate set'] },
    { brand: 'Porsgrund', models: ['Glacier bowl', "Farmer's Rose dinner set"] },
    { brand: 'Royal Copenhagen', models: ['Blue Fluted plate set', 'Flora Danica plate'] },
  ],
  silverware: [
    { brand: null, models: ['Silver tea set'] },
    { brand: 'Th. Marthinsen', models: ['Silver serving spoons'] },
    { brand: 'David-Andersen', models: ['Saga brooch', 'Silver cutlery set'] },
    { brand: 'Georg Jensen', models: ['Acorn cutlery set'] },
  ],
  // garden & tools
  lawn_mower: [
    { brand: 'Bosch', models: ['Rotak 34 lawn mower'] },
    { brand: 'Stiga', models: ['Combi 48 lawn mower'] },
    { brand: 'Honda', models: ['HRG 466 lawn mower'] },
    { brand: 'Husqvarna', models: ['LC 140 lawn mower', 'Automower 305 robot mower'] },
  ],
  power_drill: [
    { brand: 'Bosch', models: ['PSB 18 LI drill', 'GSR 18V drill'] },
    { brand: 'Makita', models: ['DDF485 drill', 'DHP482 drill'] },
    { brand: 'DeWalt', models: ['DCD796 drill'] },
    { brand: 'Milwaukee', models: ['M18 FPD drill'] },
  ],
  garden_furniture: [
    { brand: null, models: ['Teak garden bench', 'Rattan lounge set'] },
    { brand: 'IKEA', models: ['Askholmen garden set', 'Äpplarö garden set'] },
    { brand: 'Brafab', models: ['Teak garden set'] },
  ],
  grill: [
    { brand: null, models: ['Kettle charcoal grill'] },
    { brand: 'Weber', models: ['Master-Touch 57 grill', 'Spirit E-315 gas grill'] },
    { brand: 'Broil King', models: ['Baron 440 gas grill'] },
    { brand: 'Napoleon', models: ['Rogue 425 gas grill'] },
  ],
  hedge_trimmer: [
    { brand: 'Bosch', models: ['AdvancedHedgeCut 36 hedge trimmer'] },
    { brand: 'Makita', models: ['DUH523 hedge trimmer'] },
    { brand: 'Husqvarna', models: ['115iHD45 hedge trimmer'] },
    { brand: 'Stihl', models: ['HSA 56 hedge trimmer'] },
  ],
  chainsaw: [
    { brand: 'Makita', models: ['DUC353 chainsaw'] },
    { brand: 'Stihl', models: ['MS 170 chainsaw', 'MS 250 chainsaw'] },
    { brand: 'Husqvarna', models: ['135 Mark II chainsaw', '440 chainsaw'] },
  ],
};

export { PRODUCT_CATALOG };

const TEXT_TEMPLATES = [
  '{title_prefix} {title} in {condition_label} condition with {feature_pair}, {delivery_label}',
  '{title} ({age_label}) - {condition_label} {subcategory_label} with {feature_pair} and {price_band}',
  '{condition_cap} {subcategory_label} from {brand_label} in {region}, {age_label}, {delivery_label}',
  '{title} for {buyer_fit} in {municipality}, {condition_label} condition and {feature_pair}',
  '{title_prefix} {subcategory_label} - {title}, {age_label}, {feature_pair} and {price_band}',
  '{title} in {region} with {feature_pair}, {condition_label} condition and {delivery_label}',
  '{title_prefix} {title} for {buyer_fit}, {age_label} with {feature_pair}',
  '{condition_cap} {title} - {feature_pair}, {delivery_label} and {price_band}',
  '{title} from {brand_label} for {buyer_fit} - {condition_label} {subcategory_label}, {age_label}',
  '{title_prefix} {category_label} find: {title} with {feature_pair} and {delivery_label}',
];

const INTRO_TEMPLATES = [
  'This privacy-safe synthetic listing presents a {condition_label} {subcategory_label} in {municipality}, positioned in the {location_cluster} cluster.',
  'Designed as a synthetic search document, this {category_label} item represents a {condition_label} {title} in {municipality}.',
  'Synthetic second-hand profile: a {condition_label} {title} located in {municipality} and mapped to the {location_cluster} cluster.',
  'For offline relevance work, this listing models a {condition_label} {subcategory_label} in {municipality}.',
  'This synthetic recommerce record captures a {condition_label} {category_label} scenario in {municipality}.',
];

const SPECS_TEMPLATES = [
  'The item is a {subcategory_label} from {brand_label}, {age_label}, with {attribute_sentence}.',
  'Key attributes include brand {brand_label}, {age_label} of use, and {attribute_sentence}.',
  'Searchable attributes: {subcategory_label}, {brand_label}, {age_label}, {attribute_sentence}.',
  'The item profile lists {brand_label} as maker, an age of {age_label}, and {attribute_sentence}.',
];

const PRICE_TEMPLATES = [
  'The synthetic pricing profile uses an asking price of {asking_price_text} and a total price of {total_price_text}.',
  'For ranking and filter evaluation, the item is priced at {asking_price_text} asking and {total_price_text} total.',
  'Pricing signals include {asking_price_text} asking and {total_price_text} total.',
  'The listing carries {asking_price_text} asking and {total_price_text} total, sold by a {seller_label} as {sale_label}.',
];

const FEATURE_TEMPLATES = [
  'Feature coverage includes {feature_sentence}.',
  'The synthetic feature set highlights {feature_sentence}.',
  'For browse and recommendation experiments, the item signals {feature_sentence}.',
  'Notable details in this synthetic record include {feature_sentence}.',
];

const DELIVERY_TEMPLATES = [
  'Delivery: {delivery_sentence}.',
  'The handover profile states {delivery_sentence}.',
  'For logistics experiments, {delivery_sentence}.',
  'Delivery options in the synthetic model: {delivery_sentence}.',
];

const MARKET_TEMPLATES = [
  'In the timeline model, the listing is marked as {listing_status} after {days_on_market} synthetic days on market.',
  'Freshness-sensitive experiments can use the {listing_status} state and {days_on_market}-day market age.',
  'The search record also carries {days_on_market} days on market and a {listing_status} lifecycle label.',
  'For churn and reranking evaluation, the item sits in {listing_status} status with {days_on_market} days on market.',
];

const LOCATION_TEMPLATES = [
  'Geography is intentionally coarse and synthetic: county {county}, municipality {municipality}, coarse cell {coarse_geo_cell}.',
  'No exact address is stored; the listing uses county {county}, municipality {municipality}, and coarse geo cell {coarse_geo_cell}.',
  'The geographic representation is limited to {county}, {municipality}, and coarse cell {coarse_geo_cell}.',
  'Location remains privacy-safe: county {county}, municipality {municipality}, geo cell {coarse_geo_cell}.',
];

const TITLE_PREFIXES = [
  'well-kept', 'lightly used', 'barely used', 'clean', 'great-value',
  'carefully used', 'tested and working', 'quality', 'popular', 'classic',
  'practical', 'well-loved',
];

const TITLE_BUYER_FITS = [
  'everyday use', 'a first home', 'students', 'a growing family', 'collectors',
  'weekend trips', 'a home office', 'gifting', 'upcycling projects', 'hobbyists',
];

const TITLE_FALLBACK_FEATURES = [
  'good overall condition', 'fully functional', 'honest wear',
  'ready to use', 'well looked after', 'quick handover',
];

/**
 * Returns a deterministic array index derived from a SHA-256 hash of the key.
 * @param {string} key @param {number} size @returns {number}
 */
function stableIndex(key, size) {
  const digest = createHash('sha256').update(key, 'utf-8').digest('hex');
  return parseInt(digest.slice(0, 8), 16) % size;
}

/**
 * Picks one option deterministically or stochastically.
 * @param {string[]} options @param {string} mode @param {string} key @param {import('../rng.js').Rng} rng @returns {string}
 */
function pick(options, mode, key, rng) {
  if (mode === 'deterministic') return options[stableIndex(key, options.length)];
  return rng.choice(options);
}

/**
 * Picks count options without replacement, deterministically or stochastically.
 * @param {string[]} options @param {string} mode @param {string} key @param {import('../rng.js').Rng} rng @param {number} count @returns {string[]}
 */
function pickMany(options, mode, key, rng, count) {
  if (count <= 0) return [];
  if (mode === 'deterministic') {
    const ranked = [...options].sort((a, b) => {
      const ha = createHash('sha256').update(`${key}:${a}`, 'utf-8').digest('hex');
      const hb = createHash('sha256').update(`${key}:${b}`, 'utf-8').digest('hex');
      return ha < hb ? -1 : ha > hb ? 1 : 0;
    });
    return ranked.slice(0, count);
  }
  return rng.sample([...options], Math.min(count, options.length));
}

/**
 * Replaces `{key}` placeholders in a template string with values from the vars object.
 * @param {string} template
 * @param {Object.<string, *>} vars
 * @returns {string}
 */
function formatTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

/**
 * Formats a NOK value with space-separated thousands (e.g. 'NOK 4 500').
 * @param {number} value
 * @returns {string}
 */
function formatMoney(value) {
  return `NOK ${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}

/**
 * Returns a short NOK price label (e.g. "NOK 4 500 total").
 * @param {number} totalPrice
 * @returns {string}
 */
function priceBand(totalPrice) {
  return `${formatMoney(totalPrice)} total`;
}

/**
 * Returns a human-readable age label.
 * @param {number} years
 * @param {boolean} collectible
 * @returns {string}
 */
function ageLabel(years, collectible) {
  if (collectible) return `around ${years} years old`;
  if (years === 0) return 'less than a year old';
  if (years === 1) return '1 year old';
  return `${years} years old`;
}

/**
 * Returns a short delivery label for title-style text.
 * @param {Object} attrs
 * @returns {string}
 */
function deliveryLabel(attrs) {
  if (attrs.shipping_available) return `shipping for ${formatMoney(attrs.shipping_cost)}`;
  return `pickup in ${attrs.municipality}`;
}

/**
 * Returns a longer delivery sentence for descriptions.
 * @param {Object} attrs
 * @returns {string}
 */
function deliverySentence(attrs) {
  if (attrs.shipping_available) {
    return `shipping is available for ${formatMoney(attrs.shipping_cost)}, and pickup in ${attrs.municipality} is also possible`;
  }
  return `pickup only in ${attrs.municipality}, no shipping offered`;
}

/**
 * Returns a sentence fragment listing the physical attributes that are set (colour, material, size).
 * @param {Object} attrs
 * @returns {string}
 */
function attributeSentence(attrs) {
  const parts = [];
  if (attrs.color) parts.push(`colour ${attrs.color}`);
  if (attrs.material) parts.push(`material ${attrs.material}`);
  if (attrs.size) parts.push(`size ${attrs.size}`);
  return parts.length ? parts.join(', ') : 'no further physical attributes recorded';
}

/**
 * Derives a deduplicated list of readable feature labels from item attributes.
 * @param {Object} attrs
 * @returns {string[]}
 */
function featureLabels(attrs) {
  const labels = attrs.feature_tags.map(tag => tag.replace(/_/g, ' '));
  const unique = [...new Set(labels)];
  return unique.length ? unique : [...TITLE_FALLBACK_FEATURES];
}

/**
 * Picks up to two feature highlights and joins them ("a and b", or just "a").
 * @param {Object} attrs
 * @param {string} mode
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
function featurePair(attrs, mode, rng) {
  const labels = featureLabels(attrs);
  const selected = pickMany(labels, mode, `${attrs.listing_id}:title-highlights`, rng, 2);
  return selected.join(' and ');
}

/**
 * Returns a comma-separated feature sentence for use in description templates.
 * @param {Object} attrs
 * @returns {string}
 */
function featureSentence(attrs) {
  const features = featureLabels(attrs);
  return features.slice(0, 5).join(', ');
}

/**
 * Upper-cases the first character of a string.
 * @param {string} s
 * @returns {string}
 */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generates a short display title: "{brand} {model}" (e.g. "Apple iPhone 13 128 GB"),
 * or the model name alone for unbranded goods. Sized goods get a ", size X" suffix.
 * @param {Object} attrs - Must include brand, model and size.
 * @returns {string}
 */
export function buildTitle(attrs) {
  const base = attrs.brand ? `${attrs.brand} ${attrs.model}` : attrs.model;
  return attrs.size ? `${base}, size ${attrs.size}` : base;
}

/**
 * Builds the shared template variable map for an item.
 * @param {Object} attrs
 * @returns {Object.<string, *>}
 */
function templateVars(attrs) {
  return {
    title: buildTitle(attrs),
    brand_label: attrs.brand || 'an unbranded maker',
    category_label: attrs.category_label.toLowerCase(),
    subcategory_label: attrs.subcategory_label.toLowerCase(),
    condition_label: attrs.condition_label,
    condition_cap: capitalize(attrs.condition_label),
    age_label: ageLabel(attrs.age_years, attrs.collectible),
    delivery_label: deliveryLabel(attrs),
    delivery_sentence: deliverySentence(attrs),
    attribute_sentence: attributeSentence(attrs),
    price_band: priceBand(attrs.total_price),
    region: attrs.county,
    county: attrs.county,
    municipality: attrs.municipality,
    location_cluster: String(attrs.location_cluster).replace(/_/g, ' '),
    coarse_geo_cell: attrs.coarse_geo_cell,
    asking_price_text: formatMoney(attrs.asking_price),
    total_price_text: formatMoney(attrs.total_price),
    seller_label: attrs.seller_type === 'shop' ? 'second-hand shop' : 'private seller',
    sale_label: attrs.sale_type === 'bidding' ? 'an open bidding listing' : 'a fixed-price listing',
    listing_status: String(attrs.listing_status).replace(/_/g, ' '),
    days_on_market: attrs.days_on_market,
    feature_sentence: featureSentence(attrs),
  };
}

/**
 * Generates a one-sentence descriptive listing text by filling a template with derived fields.
 * @param {Object} attrs
 * @param {string} mode
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
export function buildText(attrs, mode, rng) {
  const template = pick(TEXT_TEMPLATES, mode, `${attrs.listing_id}:title`, rng);
  const title_prefix = pick(TITLE_PREFIXES, mode, `${attrs.listing_id}:title-prefix`, rng);
  const buyer_fit = pick(TITLE_BUYER_FITS, mode, `${attrs.listing_id}:buyer-fit`, rng);
  const text = formatTemplate(template, {
    ...templateVars(attrs),
    title_prefix: capitalize(title_prefix),
    buyer_fit,
    feature_pair: featurePair(attrs, mode, rng),
  });
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Generates a multi-paragraph synthetic item listing description.
 * @param {Object} attrs
 * @param {string} mode
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
export function buildDescription(attrs, mode, rng) {
  const intro = pick(INTRO_TEMPLATES, mode, `${attrs.listing_id}:intro`, rng);
  const specs = pick(SPECS_TEMPLATES, mode, `${attrs.listing_id}:specs`, rng);
  const pricing = pick(PRICE_TEMPLATES, mode, `${attrs.listing_id}:pricing`, rng);
  const features = pick(FEATURE_TEMPLATES, mode, `${attrs.listing_id}:features`, rng);
  const delivery = pick(DELIVERY_TEMPLATES, mode, `${attrs.listing_id}:delivery`, rng);
  const market = pick(MARKET_TEMPLATES, mode, `${attrs.listing_id}:market`, rng);
  const location = pick(LOCATION_TEMPLATES, mode, `${attrs.listing_id}:location`, rng);

  const combined = [intro, specs, pricing, features, delivery, market, location].join(' ');
  return formatTemplate(combined, templateVars(attrs)).replace(/\s+/g, ' ').trim();
}
