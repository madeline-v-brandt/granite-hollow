"""Names for Granite Hollow: its areas, boulders and problems.

The simulator builds the crag from numbers (angles, heights, grades, styles);
this module gives it a history. The names should read like a real place that
climbers have been naming for fifty years, so they share a little lore:

* Granite Hollow was a quarrying and mill village. The Mill Pond still feeds
  the old millrace, the Old Quarry is ringed by grout piles (the quarrymen's
  word for waste stone), and cellar holes and stone walls are all that's left
  of the village after Hollow Reservoir drowned the low end of it in the 1930s.
* Climbers arrived in the 70s. The names remember a few of them: Dot, a
  5'2" crimper who put up half the hard slabs; the Bishop, a 6'5" reach
  merchant, and the long-running argument between them; Gus, the ranger who
  spent years ticketing climbers and then took up bouldering; and Pickles,
  the parking-lot dog.
* It's New England, so there's some regional flavour: wicked, quahogs, coffee
  milk, nor'easters, Frost poems.

Every boulder has a theme, and its best and hardest lines get the theme's
best names: ominous ones for the hardest problems, playful ones for the easy
ones (with exceptions, because real names are like that). Eliminates,
traverses and sit starts are named the way real ones are, often after the
line they vary. Crag-wide pools fill in the rest with climbing culture, books,
music, myth and nonsense.

``rename_crag`` replaces the generated placeholder names. It uses its own
random stream and doesn't touch anything else about a problem, and it adds
``sector_order``/``boulder_order`` columns so the map layout never depends on
what things are called.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Old placeholder sector -> its name. Two of the old names already worked.
SECTORS = {
    "Parking Lot Boulders": "The Tailgate",
    "Warm-Up Wall": "The Schoolhouse",
    "The Pond Caves": "Millrace Caves",
    "Summit Blocks": "Hawkwatch",
    "Fern Gully": "Bracken Gully",
    "Dam Area": "The Spillway",
    "Lost Crag": "The Cellar Holes",
    "Hemlock Hollow": "Hemlock Hollow",
    "Quarry Rim": "The Grout Piles",
    "Back Forty": "Back Forty",
}
# Which sectors the map's landmarks sit beside.
POND_SECTOR, DAM_SECTOR, QUARRY_SECTOR, SUMMIT_SECTOR = "Millrace Caves", "The Spillway", "The Grout Piles", "Hawkwatch"

# (old sector, old boulder) -> (boulder name, theme names). In a theme, "!"
# marks a name meant for a hard problem (V9+) and "~" one for an easy problem
# (V0-V3); the rest go anywhere. Earlier names go to better lines.
B = {
    # ---- The Tailgate: the boulders you can see from the car ----------------
    ("Parking Lot Boulders", "Mushroom Rock"): ("Gus's Rock", [
        "Ranger Gus", "~Carry In, Carry Out", "~Leave No Trace", "Day Use Only", "Gate Closes at Dusk",
        "Permit Required", "Stay on the Trail", "~No Swimming", "Pets Must Be Leashed", "Fire Danger: Moderate",
        "!Citation", "!Trespass", "Lost and Found", "Off Season", "~Kiosk", "!Park After Dark"]),
    ("Parking Lot Boulders", "Barge Boulder"): ("The Billboard", [
        "Your Ad Here", "~Fine Print", "Brand Loyalty", "Subliminal", "Mad Men", "!Bait and Switch",
        "!Terms and Conditions Apply", "~Jingle"]),
    ("Parking Lot Boulders", "Whale Boulder 2"): ("The Tollbooth", [
        "~Exact Change", "Fast Lane", "Toll Road", "!No Passing Zone", "Merge Left", "Rumble Strip"]),
    ("Parking Lot Boulders", "Elephant Boulder"): ("The Dumpster", [
        "~Dumpster Diving", "~Recycling Day", "Trash Panda", "Curbside", "Lid Lifter", "Smells Like Sendin'",
        "!Waste Management", "!Hazmat", "Compactor", "Pickup Thursday", "Raccoon Eyes"]),
    ("Parking Lot Boulders", "Whale Stone"): ("The Curb", [
        "~Curb Appeal", "Speed Bump", "!Ankle Biter", "Parallel Parking", "Pahk the Cah"]),
    ("Parking Lot Boulders", "Pulpit Boulder 2"): ("Pickles' Rock", [
        "~Good Girl, Pickles", "~Fetch", "Belly Rub", "Squirrel!", "Zoomies", "Off Leash", "Who Ate My Sandwich"]),
    ("Parking Lot Boulders", "Coffin Block"): ("The Tailpipe", [
        "Creeper", "Under the Hood", "Oil Change", "Grease Monkey", "Check Engine Light", "Lowrider",
        "Exhaust Leak", "!Catalytic Converter", "!Carbon Monoxide", "Jumper Cables", "Rust Belt",
        "~Fuzzy Dice", "Spare Tire", "Muffler"]),
    ("Parking Lot Boulders", "Mushroom Boulder 3"): ("The Cooler", [
        "Cold One", "~Juice Box", "~Ice Pack", "Tailgate Party", "Potato Salad", "Mayo in the Sun",
        "Warm Soda", "Bottle Opener", "Last Clementine", "!Food Poisoning"]),

    # ---- The Schoolhouse: the foundation of the village school ---------------
    ("Warm-Up Wall", "Molar Boulder"): ("The Belfry", [
        "For Whom the Bell Tolls", "Bats in the Belfry", "~Ring the Bell", "~Morning Bell", "Bell Curve",
        "Quasimodo", "Saved by the Bell", "Tintinnabulation", "Clapper", "Last Bell", "Crack in the Bell",
        "Carillon", "Pavlov's Dog", "Ring Finger", "More Cowbell", "~Cowbell", "Sanctuary!", "Rope Pull",
        "Rafters", "Echolocation", "Vampire Bat", "Dinner Bell", "Bell Bottoms", "Clang", "Peal", "Toll Free",
        "Hunchback", "Ding Dong", "!The Final Bell", "!Death Knell", "!Tolling", "!Belltower Ghost"]),
    ("Warm-Up Wall", "Mushroom Block"): ("The Gymnasium", [
        "Rope Climb", "Presidential Fitness Test", "Dodgeball", "Picked Last", "Sit-and-Reach",
        "Monkey Bars", "Pull-Up Bar", "Shuttle Run", "Pacer Test", "Bleachers", "Pep Rally", "Free Throw",
        "Kickball", "~Four Square", "~Parachute Day", "~Tetherball", "Gym Socks", "Locker Room",
        "Benchwarmer", "Junior Varsity", "Varsity", "Square Dancing Unit", "Floor Hockey", "Trophy Case",
        "Homecoming", "The Big Game", "Halftime", "Overtime", "Buzzer Beater", "Fire Drill", "Swirly",
        "Wedgie", "Field Day", "~Egg and Spoon", "~Three-Legged Race", "Coach's Whistle", "Dodge, Duck, Dip",
        "Hacky Sack", "Mascot", "Prom Night", "!Sudden Death", "!Coach's Revenge", "!Varsity Squad",
        "!Detention Hall"]),
    ("Warm-Up Wall", "Whale Rock"): ("The Blackboard", [
        "Show Your Work", "~Chalk Dust", "~Gold Star", "Cursive", "Long Division", "Erasers", "Pop Quiz",
        "Spelling Bee", "Times Tables", "Fractions", "Penmanship", "Extra Credit", "Teacher's Pet",
        "Write It 100 Times", "!Fingernails", "!Final Exam"]),
    ("Warm-Up Wall", "Bunker Boulder"): ("Detention", [
        "Hall Pass", "Principal's Office", "After School", "Note From Home", "Spitball", "Permanent Record",
        "Passing Notes", "Dog Ate My Homework", "~Recess", "!Expelled", "!Suspended"]),
    ("Warm-Up Wall", "Whale Boulder"): ("The Desk", ["~Gum Underneath", "Carved Initials", "Inkwell"]),
    ("Warm-Up Wall", "Haystack Rock"): ("The Sandbox", [
        "~Sand Castle", "~Shovel and Pail", "~Mud Pie", "~Buried Treasure", "Sandbagger"]),
    ("Warm-Up Wall", "Mushroom Boulder 2"): ("The Cafeteria", [
        "Food Fight", "~Mystery Meat", "~Tater Tots", "Lunch Lady", "Sloppy Joe", "Chocolate Milk",
        "Pizza Friday", "Trade You", "Lunch Money", "Hairnet", "Fish Stick Friday", "Corn Dog",
        "Chicken Nuggies", "!Food Coma"]),
    ("Warm-Up Wall", "Whale Rock 2"): ("The Apple", ["!Original Sin", "Honeycrisp", "An Apple a Day", "Core Strength"]),
    ("Warm-Up Wall", "Egg Boulder 5"): ("The Science Lab", [
        "Baking Soda Volcano", "Bunsen Burner", "Petri Dish", "Frog Dissection", "Periodic Table", "Beaker",
        "Mad Scientist", "Control Group", "Hypothesis", "Safety Goggles", "!Critical Mass", "!Chain Reaction"]),
    ("Warm-Up Wall", "Bread Loaf Block"): ("The Lunchbox", ["Crusts Cut Off", "PB and J", "Thermos"]),

    # ---- Millrace Caves: the old grist mill below Mill Pond ------------------
    ("The Pond Caves", "Egg Boulder 4"): ("The Engine Room", [
        "Ghost in the Machine", "Flywheel", "Gearbox", "Steam Whistle", "Assembly Line", "Piecework",
        "Night Shift", "Graveyard Shift", "Punch Clock", "Time and a Half", "Union Rules", "Picket Line",
        "Spinning Jenny", "Luddite", "Boiler Room", "Pressure Valve", "Pistons", "Drive Shaft", "Belt Drive",
        "Cog in the Machine", "Deus ex Machina", "Modern Times", "Rust Never Sleeps", "Smokestack",
        "Company Town", "Foreman", "Lunch Pail", "Hard Hat", "Lockout, Tagout", "Safety Third", "Clockwork",
        "Perpetual Motion", "Torque", "Ratchet", "Monkey Wrench", "Sprocket", "Grease Gun", "Lathe",
        "Anvil Chorus", "Iron Lung", "Blast Furnace", "~Coffee Break", "~Shift Change", "~Whistle Stop",
        "!The Mill Fire of 1891", "!Industrial Accident", "!Heavy Machinery", "!The Machine Stops"]),
    ("The Pond Caves", "Molar Stone"): ("The Grotto", [
        "Plato's Cave", "Stalactite", "Spelunker", "Shadow Puppets", "Echo Chamber", "Troglodyte",
        "Dripstone", "Flowstone", "Headlamp", "Cave Painting", "Firelight", "Moonmilk", "~Lantern Light",
        "Styx", "Charon's Fee", "Underworld", "!Don't Look Back", "!Orpheus", "!Persephone", "!Eurydice"]),
    ("The Pond Caves", "Throne Rock"): ("The Millstone", [
        "Run of the Mill", "Daily Grind", "~Grist", "~Grain of Salt", "Grindstone", "Nose to the Grindstone",
        "Wheat From Chaff", "Flour Power", "Mill Wheel", "Grist for the Mill", "Stone Ground", "Millrace",
        "Sack of Flour", "The Miller's Tale", "Elbow Grease", "Rolling Stone", "!Millstone Around Your Neck",
        "!Grinding Gears"]),
    ("The Pond Caves", "Elephant Boulder 3"): ("The Bullfrog", [
        "Jeremiah", "~Lily Pad", "~Ribbit", "Croak", "Tadpole", "Leapfrog", "Kiss the Frog",
        "Frog in Your Throat", "Pond Scum", "Peeper Season", "!Frog Prince"]),
    ("The Pond Caves", "Sphinx Boulder 2"): ("The Waterwheel", [
        "Overshot", "Undershot", "~Paddle", "~Splash Zone", "Bucket Brigade", "Turn, Turn, Turn", "Cog",
        "Wheel of Fortune", "Spin Doctor"]),
    ("The Pond Caves", "Wedge Boulder"): ("The Doorstop", [
        "Foot in the Door", "~Hold the Door", "~Knock Knock", "Who's There", "Draft Dodger",
        "Open Door Policy", "Door Jamb", "!Slammed"]),

    # ---- Hawkwatch: the bald summit where the birders count hawks -----------
    ("Summit Blocks", "Throne Boulder 2"): ("Old Baldy", [
        "Night on Bald Mountain", "Comb-Over", "Cue Ball", "Shiny Dome", "Bald Spot", "Hair Today",
        "Buzz Cut", "Barbershop Quartet", "Sweeney Todd", "Close Shave", "Mullet", "Business in Front",
        "Party in the Back", "Bad Hair Day", "Hair of the Dog", "Split Ends", "Cowlick", "Toupee or Not Toupee",
        "Wig Out", "Rapunzel", "Hairline Fracture", "Hair Trigger", "Hairpin", "By a Hair", "Hair Raiser",
        "Splitting Hairs", "Hairball", "Grey Area", "Silver Fox", "Senior Discount", "Early Bird Special",
        "Back in My Day", "Get Off My Lawn", "Whippersnapper", "~Sunscreen", "~Bucket Hat",
        "~Sunburnt Scalp", "!Samson", "!Delilah", "!Midlife Crisis", "!Male Pattern Boldness"]),
    ("Summit Blocks", "Cauldron Boulder 2"): ("The Thermal Slab", [
        "Kettle of Hawks", "Riding the Thermal", "Updraft", "Downdraft", "Tailwind", "Headwind", "Crosswind",
        "Windward", "Leeward", "Glide Path", "Soaring", "Lift", "Migration", "Flyway", "Southbound",
        "Hawk Count", "Broad-Winged", "Red-Tailed", "Sharp-Shinned", "Kestrel", "Merlin", "Harrier",
        "Osprey", "Turkey Vulture", "Plumage", "Flight Feathers", "Wingspan", "Hollow Bones", "Air Brakes",
        "Zephyr", "Squall", "Doldrums", "~Light Breeze", "~Kite Flying", "~Gust", "!Peregrine", "!Stoop",
        "!Free Fall", "!Gone With the Wind"]),
    ("Summit Blocks", "Pulpit Boulder"): ("The Lookout", [
        "Quarter for the Binoculars", "~Scenic View", "~Photo Op", "Telescope", "Far Horizon", "Land Ho",
        "Crow's Nest", "Vista", "Panorama", "Sightline", "Spyglass", "Fire Tower", "Widow's Walk",
        "Lookout Point", "!Bird's-Eye View"]),
    ("Summit Blocks", "Throne Block"): ("The Aerie", [
        "!Icarus", "Wings of Wax", "Daedalus", "Eagle Eye", "Eaglet", "Golden Eagle", "The Eagle Has Landed",
        "Talons", "Screech", "Swoop", "Skyward", "~High Nest", "!Too Close to the Sun"]),
    ("Summit Blocks", "Cube Boulder"): ("The Birdhouse", [
        "Free Bird", "~Tweet", "~Early Bird", "Bird Brain", "Nest Egg", "Empty Nest", "Feeder", "Suet",
        "Pecking Order", "Birds of a Feather", "Little Wren", "Cuckoo"]),
    ("Summit Blocks", "Prow Boulder"): ("The Raptor", [
        "Clever Girl", "Sickle Claw", "Hunting Party", "Apex", "Prey Drive", "Shadow on the Grass",
        "Tooth and Claw", "Jurassic", "~Hatchling", "!Bird of Prey", "!Predator"]),
    ("Summit Blocks", "Tusk Boulder"): ("The Beak", [
        "Pecking", "Pointy End", "Woodpecker", "Puffin", "Snapper", "Hook-Billed", "~Beak to Beak",
        "~Birdseed", "!Shrike"]),
    ("Summit Blocks", "Coffin Rock"): ("The Weathervane", [
        "!True North", "Compass Rose", "Rooster", "~Which Way the Wind Blows", "Spin Cycle", "Due East",
        "Due West", "Southpaw", "Magnetic North"]),
    ("Summit Blocks", "Toad Boulder"): ("The Perch", ["Perched", "Roost", "!Death Grip", "Talon", "~Pigeon Toed"]),
    ("Summit Blocks", "Egg Boulder"): ("The Nest", ["Fledgling", "Out of the Nest", "Robin's Egg Blue", "Hatched"]),
    ("Summit Blocks", "Ship Boulder 2"): ("The Chickadee", [
        "~Chick-a-Dee-Dee-Dee", "~Fluff Ball", "~Black Cap", "~Seed Thief", "~Tiny Dancer"]),

    # ---- Bracken Gully: ferns, moss and a lot of children's books ------------
    ("Fern Gully", "Igloo Boulder"): ("The Wardrobe", [
        "Through the Wardrobe", "Mothballs", "Fur Coats", "Always Winter", "Mr. Tumnus", "Deeper Magic",
        "Turkish Delight", "The White Witch", "Cair Paravel", "Dawn Treader", "Reepicheep", "Puddleglum",
        "Marsh-wiggle", "~Lamp Post", "!The Stone Table"]),
    ("Fern Gully", "Molar Rock"): ("The Fossil", [
        "Trilobite", "Ammonite", "Amber", "Missing Link", "Carbon Dating", "Fossil Record", "Dig Site",
        "Bone Wars", "Cretaceous", "Ice Age", "Tar Pit", "Living Fossil", "Coelacanth", "Pterodactyl",
        "Primordial Ooze", "!Asteroid", "!Extinction Event"]),
    ("Fern Gully", "Lighthouse Block"): ("Mossback", [
        "A Rolling Stone Gathers No Moss", "~Moss Piglet", "Moss Boss", "Wire Brush", "Clean Freak",
        "Toothbrush Beta", "Peat", "Sphagnum", "Moss Graffiti", "Green Thumb", "Damp Squib", "Never Dries",
        "!Tardigrade"]),
    ("Fern Gully", "Egg Boulder 2"): ("The Toadstool", [
        "Fairy Ring", "Puffball", "The Morel of the Story", "Fun Guy", "Chanterelle", "Mycelium",
        "Spore Print", "Gills", "~Button Mushroom", "!Death Cap", "!Destroying Angel"]),
    ("Fern Gully", "Bunker Rock"): ("The Fiddlehead", [
        "Fiddler on the Roof", "~Fiddlehead Season", "Second Fiddle", "Fit as a Fiddle", "Unfurling",
        "Fiddle Faddle", "Rosin", "!The Devil Went Down", "!Fiddlesticks"]),
    ("Fern Gully", "Mushroom Stone"): ("The Hobbit Hole", [
        "Second Breakfast", "Elevenses", "Round Door", "There and Back Again", "Not All Who Wander",
        "Pipe-Weed", "~Bag End", "!Riddles in the Dark", "!Precious"]),
    ("Fern Gully", "Shark Fin Rock"): ("The Sundew", [
        "Feed Me", "Flytrap", "Pitcher Plant", "Little Shop of Horrors", "Sticky Situation", "Bog Body",
        "Carnivore", "Dew Drop", "Sweet Trap"]),
    ("Fern Gully", "Elephant Boulder 2"): ("The Lamp Post", ["Narnia", "~Snow in the Lamplight"]),
    ("Fern Gully", "Bunker Rock 2"): ("The Stump", ["Stump Speech"]),

    # ---- The Spillway: the dam that drowned the old village -----------------
    ("Dam Area", "Sphinx Boulder"): ("The Floodgate", [
        "High Water Mark", "Steeple Under Water", "The Drowned Town", "Drought Year", "Low Water",
        "Atlantis", "Water Under the Bridge", "Dam Fine", "Dam Busters", "Leaky Faucet", "Hydroelectric",
        "Overflow", "Sandbag", "When the Levee Breaks", "Riptide", "Undertow", "Whirlpool", "Deep End",
        "Treading Water", "Water Wings", "Cannonball", "Belly Flop", "No Lifeguard on Duty",
        "Swim at Your Own Risk", "Dam Keeper", "Sluice Gate", "Fish Ladder", "Salmon Run", "Beaver Fever",
        "~Floodlight", "~Puddle Jumper", "~Rubber Duck", "!The Flood of '38", "!Rising Tide",
        "!The Drowning Pool", "!Lady of the Lake"]),
    ("Dam Area", "Whale Boulder 3"): ("The Retaining Wall", [
        "Finger in the Dike", "Little Dutch Boy", "Concrete Jungle", "Rebar", "Formwork", "Wet Cement",
        "Expansion Joint", "Crack in the Dam", "Load Bearing", "Structural Integrity", "Spalling",
        "Stress Test", "Pressure Gauge", "Inspection Due", "Weep Hole", "Water Table", "Another Brick",
        "The Great Wall", "Wall of Sound", "Keep Off", "~Hopscotch", "~Sidewalk Chalk", "!Condemned",
        "!Load Limit Exceeded"]),
    ("Dam Area", "Egg Boulder 3"): ("The Buoy", ["~Bobber", "~Life Jacket", "~Doggy Paddle", "~Floatie"]),

    # ---- The Cellar Holes: what's left of the village ------------------------
    ("Lost Crag", "Sphinx Stone"): ("The Hearthstone", [
        "Hearth and Home", "Old Flame", "Slow Burn", "Embers", "Kindling", "Andirons", "Pot Hook",
        "Chimney Sweep", "Soot", "Fireside Chat", "Smoke Signal", "Ghost Story", "Bump in the Night",
        "Poltergeist", "Will-o'-the-Wisp", "Crackle", "Tinder", "Flint and Steel", "Hearth Cat",
        "Rocking Chair", "Grandfather Clock", "Heirloom", "Burn Notice", "~Home Fires", "~Kettle's On",
        "~Toasted Marshmallow", "!The Hollow Ghost", "!Burnt Offering", "!Ashes to Ashes"]),
    ("Lost Crag", "Throne Boulder"): ("The Stone Wall", [
        "Good Fences", "Mending Wall", "The Road Not Taken", "Stopping by Woods", "Miles to Go",
        "Before I Sleep", "Fire and Ice", "Nothing Gold Can Stay", "Birches", "After Apple-Picking",
        "Fieldstone", "Glacial Erratic", "Frost Heave", "Dry Stack", "Boundary Line", "~Stone Fence",
        "!Out, Out", "!Acquainted With the Night"]),
    ("Lost Crag", "Barge Boulder 2"): ("The Barn", [
        "Barn Raising", "Hayloft", "Barn Owl", "Barn Door", "Born in a Barn", "Barnstormer",
        "Pitchfork", "Hay Is for Horses", "~Barn Cats", "!Barn Burner"]),
    ("Lost Crag", "Barge Stone"): ("The Root Cellar", [
        "Root Vegetables", "Canned Goods", "Pickled", "Turnip", "Beet It", "Mason Jar", "Cold Storage",
        "!Down in the Hole"]),
    ("Lost Crag", "Cube Stone"): ("The Woodshed", [
        "Something Nasty in the Woodshed", "Axe to Grind", "Splitting Maul", "Cord of Wood", "Chopping Block"]),
    ("Lost Crag", "Igloo Stone"): ("The Well", ["Wishing Well", "Bottomless"]),

    # ---- Hemlock Hollow: dark, quiet, and a little philosophical -------------
    ("Hemlock Hollow", "Thumb Stone"): ("The Squeezebox", [
        "Accordion", "Polka", "Oompah", "Concertina", "Lederhosen", "Push and Pull", "Bear Hug",
        "Big Squeeze", "Squeeze Play", "Pressure Cooker", "Juicer", "Panini Press", "Grilled Cheese",
        "Vise Grip", "Clamshell", "Pincer Movement", "Group Hug", "Hug It Out", "Python", "~Lemon Squeezy",
        "~Easy Peasy", "~Hug Life", "!Boa Constrictor", "!Death Hug"]),
    ("Hemlock Hollow", "Ship Boulder"): ("Socrates", [
        "The Unexamined Life", "Know Thyself", "Gadfly", "Socratic Method", "Symposium", "Agora",
        "Apology", "Dialogue", "~I Know Nothing", "!The Hemlock Cup"]),
    ("Hemlock Hollow", "Turtle Boulder 2"): ("The Snapping Turtle", [
        "Turtles All the Way Down", "Shell Shock", "Slow and Steady", "Tortoise and Hare", "Box Turtle",
        "Head in the Shell", "Cowabunga", "~Turtle Power", "!Snap Decision", "!Snapper's Revenge"]),
    ("Hemlock Hollow", "Sphinx Rock"): ("The Owl", [
        "Who Cooks for You", "~Hoot", "Night Owl", "Barred", "Owl Pellet", "Parliament", "Nocturne",
        "Wise Guy"]),
    ("Hemlock Hollow", "Egg Stone"): ("The Hush", [
        "Sound of Silence", "Library Voice", "Quiet Hours", "Whisper", "Pin Drop", "Hush Money",
        "~Shh", "!Silent Night"]),

    # ---- The Grout Piles: the quarry and its waste stone ---------------------
    ("Quarry Rim", "Bread Loaf Boulder"): ("The Monument", [
        "!Ozymandias", "Look On My Works", "Obelisk", "Epitaph", "Here Lies", "In Loving Memory",
        "Rest in Pieces", "Granite State", "Cornerstone", "Plinth", "Rosetta Stone", "Gravestone Rubbing"]),
    ("Quarry Rim", "Lighthouse Boulder"): ("The Tombstone", [
        "I'm Your Huckleberry", "Headstone", "Grave Matters", "Dead Ringer", "Final Resting Place",
        "Boot Hill", "Doc Holliday", "Shootout", "Dead Man's Hand", "Last Rites", "Gravedigger",
        "Skeleton Key", "Exhumed", "~Daisies", "!Six Feet Under", "!The Undertaker"]),
    ("Quarry Rim", "Turtle Rock"): ("The Headwall", [
        "Quarryman's Leap", "Drill Marks", "Feather Marks", "Core Sample", "Bedrock", "Overburden",
        "Deep Cut", "Benchmark", "Sheer Folly", "Point of No Return", "Exit Strategy", "Second Thoughts",
        "~Topsoil", "!Swan Dive", "!Rock Bottom"]),
    ("Quarry Rim", "Throne Stone"): ("The Stonecutters", [
        "Plug and Feathers", "Carrara", "Aberdeen", "Chisel", "Mallet", "Pitching Tool", "Stonecutter's Lunch",
        "Polenta", "Haggis", "Union Hall", "Dust Mask", "Hammer Hand", "~Granite Dust", "!Master Carver",
        "!Silicosis"]),
    ("Quarry Rim", "Cauldron Boulder"): ("The Powder House", [
        "Fire in the Hole", "Dynamite", "Short Fuse", "Blasting Cap", "Kaboom", "Detonator", "Powder Keg",
        "Big Bang", "Plunger", "Shrapnel", "TNT", "Boom Goes the Dynamite", "Charge"]),
    ("Quarry Rim", "Anvil Block"): ("The Anvil", [
        "Hammer and Anvil", "~Horseshoe", "Hammer Time", "Strike While It's Hot", "Wrought Iron", "Forge",
        "Tongs", "Temper Tantrum", "Quench", "Smithy", "Iron Will", "Blacksmith"]),
    ("Quarry Rim", "Thumb Boulder"): ("The Derrick", [
        "Crane Kick", "Boom", "Guy Wire", "Hoist", "Block and Tackle", "Heave Ho", "Load Limit",
        "Counterweight", "Swing Load", "Overhead", "!Dead Lift"]),
    ("Quarry Rim", "Pulpit Boulder 3"): ("The Swimming Hole", [
        "Cold Plunge", "Skinny Dip", "Polar Bear Club", "Rope Swing", "Leeches", "Cool Off", "Cannonball Run",
        "Bathing Suit", "!Deep Water"]),
    ("Quarry Rim", "Pulpit Stone"): ("The Offcut", ["Scrap", "Remnant", "~Leftovers", "~Chips"]),
    ("Quarry Rim", "Lighthouse Boulder 2"): ("The Rubble", ["Rubble Rouser", "Pile On", "Gravel Pit", "Hardcore"]),
    ("Quarry Rim", "Cauldron Block"): ("The Reject", ["Seconds"]),

    # ---- Back Forty: the far field of the old farm ---------------------------
    ("Back Forty", "Molar Block"): ("The Scarecrow", [
        "If I Only Had a Brain", "Headless Horseman", "Straw Man", "Crow Bait", "Corn Maze", "Harvest Moon",
        "Murder of Crows", "Field of Dreams", "Ichabod", "Stalk", "Husk", "Kernel", "Cornfed",
        "~Corn on the Cob", "~Hayride", "!Children of the Corn", "!The Long Night"]),
    ("Back Forty", "Ship Rock"): ("The Tractor", [
        "Power Take-Off", "Green Machine", "Hay Baler", "Plow Through", "Furrow", "Harrow", "Rototiller",
        "Combine", "Diesel", "Sod Buster", "Back Roads", "Farm Use Only", "Rusty Tines", "Mud Season"]),
    ("Back Forty", "Turtle Boulder"): ("The Haybale", [
        "Needle in a Haystack", "Hay Fever", "Square Bale", "Round Bale", "Make Hay", "Bale Out",
        "Pitch In", "!The Last Straw"]),
    ("Back Forty", "Mushroom Boulder"): ("The Cow Pie", [
        "Till the Cows Come Home", "Cow Tipping", "Udderly", "Holy Cow", "~Moo", "!Mad Cow"]),
    ("Back Forty", "Mushroom Block 2"): ("The Salt Lick", ["~Salt Lick", "~Lick It"]),
    ("Back Forty", "Bread Loaf Stone"): ("The Milk Can", ["Cream Rises", "Got Milk"]),
}

# A few of the old placeholder names that already sound like real problems.
KEEP = {
    "Velvet Sermon", "Paper Lantern", "Glass Owl", "Bitter Owl", "Frozen Pilgrim", "Electric Weasel",
    "Wicked Arete", "Phantom Pancake", "Rusty Lobster", "Hollow Prophet", "Polished Butter", "Feral Banana",
    "Cosmic Biscuit", "Iron Lantern", "Midnight Pilgrim", "Lazy Sermon", "Angry Pancake", "Golden Lobster",
}

# ---- crag-wide pools ----------------------------------------------------------
EASY_POOL = [
    "Training Wheels", "Baby Steps", "Jug Haul", "Stairmaster", "Bunny Slope", "Kiddie Pool", "Sunday Stroll",
    "Easy Like Sunday Morning", "Hello World", "Gateway Drug", "Starter Pack", "First Date", "Tiny Victories",
    "Participation Trophy", "Snack Break", "Warm Fuzzies", "Free Lunch", "Up and Over", "Dot's First",
    "Gus Was Here", "Pickles Approves", "Choose Your Own Adventure", "Goodnight Moon",
    "Where the Wild Things Are", "The Very Hungry Caterpillar", "The Little Engine", "Frog and Toad", "Hop on Pop",
    "Green Eggs", "Pat the Bunny", "Nap Time", "Pillow Fort", "Bubble Bath", "Hygge", "Tea Time", "Biscuit",
    "Cinnamon Roll", "Grandma's Cookies", "Hot Cocoa", "S'mores", "Campfire Song", "Kumbaya", "Hammock",
    "Lazy Susan", "Couch Potato", "Sweatpants", "Fuzzy Socks", "Slippers", "Butter Knife", "Welcome Mat",
    "Easy Street", "Low-Hanging Fruit", "Piece of Cake", "Cakewalk", "Walk in the Park", "Child's Play",
    "Gimme", "Freebie", "Bonus Round", "Tutorial", "Level One", "Press Start", "Coffee Milk", "Clam Cakes",
    "Stuffies", "Frappe", "Totoro", "Catbus", "Muppet Babies", "Saturday Cartoons", "Snow Day",
    "Hot Dish", "Potluck", "Bring a Dish", "Ladder Day", "Jungle Gym", "Pony Ride", "Petting Zoo",
]
MID_POOL = [
    "Beta Spray", "Send Train", "Crimp Shrimp", "Sloper Opera", "Pinch Me", "Heel Thyself", "Toe the Line",
    "Smear Campaign", "Dyno-Might", "Mantel Piece", "Arête Franklin", "Flake News", "Chalk Talk", "Tick Mark",
    "Brush Off", "Pad Shuffle", "Spot On", "Dab Hand", "Highpoint Blues", "Project Runway", "Flash in the Pan",
    "One More Go", "Last-Go Syndrome", "Rest Day", "Skin in the Game", "Flapper Jack", "Split Tip",
    "Soft Touch", "Grade Chaser", "Logbook Lies", "Downgrade", "Three-Star Snack", "Approach Shoes",
    "Crashpad Taco", "Guidebook Says", "No Topo", "Name Withheld", "FA Unknown", "Kneebar Mitzvah",
    "Dropknee Jerk", "Gaston Martin", "Undercling Ding", "Bat Hang", "Figure Four", "Campus Tour",
    "Deadpoint Society", "Leap of Faith", "Hail Mary", "Slab Happy", "Friction Fiction", "Pulp Friction",
    "Trust Fall", "Pebble Pusher", "Grease Lightning", "Sweaty Betty", "Humidity Index", "Send Temps",
    "Dew Point", "Golden Hour", "Blue Hour", "Headlamp Session", "Dawn Patrol", "Lunch Break", "Sick Day",
    "The Tuesday Crew", "Old Guard", "New School", "Gumby", "Choss Boss", "Gym Rat", "Outdoor Cat",
    "Plastic Fantastic", "Hollow Victory", "The Hollow Men", "Prufrock", "Moby Dick", "Call Me Ishmael",
    "White Whale", "Catch-22", "So It Goes", "Brave New World", "Dune", "The Spice Must Flow", "Don't Panic",
    "Towel Day", "Babel Fish", "Little Women", "Pride and Prejudice", "Sense and Sensibility",
    "Wuthering Heights", "Great Expectations", "Watership Down", "Mr. Toad's Wild Ride", "Hundred Acre Wood",
    "Eeyore", "Free Fallin'", "Rock Lobster", "Love Shack", "Rock the Casbah", "Should I Stay or Should I Go",
    "Under Pressure", "Stayin' Alive", "Gimme Shelter", "Paint It Black", "Here Comes the Sun",
    "Octopus's Garden", "Thunder Road", "Dancing Queen", "Take On Me", "Total Eclipse", "Holding Out for a Hero",
    "Space Oddity", "Ground Control", "Rocket Man", "Starman", "Fast Car", "Running Up That Hill",
    "Hounds of Love", "Landslide", "Go Your Own Way", "Rhiannon", "Edge of Seventeen", "Linger", "Wonderwall",
    "Karma Police", "No Surprises", "Everything in Its Right Place", "Weird Fishes", "Seven Nation Army",
    "Heart of Glass", "Once in a Lifetime", "Burning Down the House", "Road to Nowhere",
    "This Must Be the Place", "Where Is My Mind", "Debaser", "Gigantic", "Come As You Are", "Lithium",
    "The Mayonnaise Incident", "Goose Attack", "Emotional Support Pad", "Pad Hoarder", "Two Dads, One Pad",
    "My Other Car Is a Crashpad", "Uncle Gary's Jeep", "Ham Sandwich", "Cold Pizza", "Tuna Melt",
    "Hot Dog Water", "Pickle Juice", "Mustard Tiger", "Crumb Bum", "Baguette", "Pretzel Logic",
    "Spaghetti Arms", "Noodle Arms", "Jelly Legs", "Sewing Machine Leg", "Elvis Leg", "Pendulum",
    "Snooze Button", "Five More Minutes", "Coffee First", "Decaf", "Double Shot", "Espresso Yourself",
    "Everything Bagel", "Lox and Load", "Schmear", "Gravy Train", "Meatloaf", "Jell-O Mold", "Ambrosia Salad",
    "Quahog", "Grinder", "Packie Run", "Wicked Smaht", "Nor'easter", "Mud Season", "Leaf Peeper",
    "Apple Cider Donut", "Maple Syrup", "Sugar Shack", "Clam Chowdah", "Lobster Roll", "Town Meeting",
    "Blizzard of '78", "Ice Storm", "Black Ice", "Dot Matrix", "Ask Dot", "Bishop's Gambit", "Gus Says No",
    "Ranger Danger", "Pickles' Revenge", "Hollow Point",
]
HARD_POOL = [
    "Leviathan", "Behemoth", "Charybdis", "Scylla", "Minotaur", "Labyrinth", "Ariadne's Thread", "Medusa",
    "Gorgon", "Cerberus", "Hydra", "Chimera", "Kraken", "Fenrir", "Ragnarök", "Valhalla", "Yggdrasil",
    "Sisyphus", "Tantalus", "Prometheus", "Pandora's Box", "Nemesis", "Hubris", "Achilles' Heel",
    "Trojan Horse", "Siren Song", "Lotus Eaters", "Cyclops", "Nobody", "The Furies", "Erebus", "Nyx",
    "Tartarus", "Elysium", "Purgatorio", "Inferno", "Abandon All Hope", "Paradise Lost", "Better to Reign",
    "Faust", "Mephisto", "Crossroads", "Hellhound on My Trail", "Grendel", "Grendel's Mother",
    "The Green Knight", "Excalibur", "Holy Grail", "Avalon", "Mordred", "'Tis But a Scratch", "Jabberwock",
    "Vorpal Blade", "Bandersnatch", "Ahab", "Nautilus", "Heart of Darkness", "The Horror", "Event Horizon",
    "Singularity", "Black Hole", "Dark Matter", "Entropy", "Heat Death", "Supernova", "Neutron Star",
    "Pulsar", "Escape Velocity", "Terminal Velocity", "Gravity's Rainbow", "Breaking Point", "Requiem",
    "Dies Irae", "Lacrimosa", "Danse Macabre", "Ride of the Valkyries", "Hall of the Mountain King",
    "Rite of Spring", "Firebird", "Mars, the Bringer of War", "Thunderdome", "Witness Me", "Redrum",
    "Room 237", "All Work and No Play", "Nostromo", "Tears in Rain", "Voight-Kampff", "No-Face",
    "Calcifer", "The Bishop's Reach", "Bishop's Folly", "Dot's Revenge", "The Long Winter", "Whiteout",
    "Wicked Hard", "Hurricane Season", "Eldritch", "Necronomicon", "Cthulhu Fhtagn",
    "Innsmouth", "The Color Out of Space", "At the Mountains of Madness",
]
TRAVERSE_POOL = [
    "The Long Way Round", "Scenic Route", "Detour", "Crab Walk", "Sidestep", "Lateral Thinking",
    "Sideways Glance", "Commute", "Rush Hour", "Grand Tour", "Circumnavigation", "Around the World",
    "Pilgrimage", "Wanderlust", "Road Trip", "Shuffle", "Girdle", "Endurance Test", "Pump Clock",
    "Forearm Flood", "Pumpkin Spice", "Popeye", "Pump Up the Jam", "Lactic Acid Trip", "Milk Run",
    "Pub Crawl", "Conga Line", "Book Tour", "Gap Year", "Sideshow", "Side Hustle",
]
ELIM_POOL = [
    "Fine Print", "Asterisk", "Rules Lawyer", "Technicality", "Loophole", "Red Tape", "Bureaucracy",
    "Paperwork", "House Rules", "Gentleman's Agreement", "Honor System", "The Contrivance",
    "Contrived Comfort", "Do Not Touch", "The Floor Is Lava", "Simon Says", "Mother May I",
    "Red Light, Green Light", "Twister", "Hokey Pokey", "Pedant", "Grammar Police", "Oxford Comma",
    "Semicolon", "Footnote", "Parenthetical", "Ibid.", "Errata", "Nitpick", "Rulebook", "Gerrymander",
    "Filibuster", "Minutiae", "Strict Parent", "Terms of Service", "Dress Code",
]
CHOSS_POOL = [
    "Why Though", "Lichen It", "Not Worth the Walk", "Kitty Litter", "Choss Monster", "Sandpaper",
    "Crumble Cake", "Pebble Wrestling", "Dirt Nap", "Mudslide", "Bring a Brush", "Shrug", "Meh", "Filler",
    "Lorem Ipsum", "TBD", "Placeholder", "Untitled", "Spider Hotel", "Tick Magnet", "Poison Ivy",
    "Mosquito Bait", "Deer Tick", "Lyme Light", "Wasp Nest", "Yellowjacket", "Bee Line", "Leaf Litter",
    "Pine Sap", "Bird Poop", "Dog Water", "Sad Trombone", "Participation Grade",
]
HIGHBALL_POOL = [
    "Sweaty Palms", "Vertigo", "Acrophobia", "Commitment Issues", "Don't Look Down", "Thin Air",
    "Head Game", "Brown Trousers", "Knee Knocker", "Elvis Has Left the Building", "Butterflies",
    "Ladder to Nowhere", "Up Is Optional", "Bail Jug", "Downclimb", "Topout Terror", "Pad Stacker",
    "Spotter Wanted", "Fear Is the Mind-Killer", "High Anxiety", "Sky Pilot", "Nosebleed Section",
]
BOULDER_FALLBACK = [
    "The Erratic", "The Sleeper", "The Loaf", "The Biscuit", "The Whale", "The Molar", "The Sphinx",
    "The Haystack", "The Cube", "The Egg", "The Turtle", "The Thumb", "The Igloo", "The Ship",
]
# Rules that turn a line into its eliminate: "<line> (Crimps Only)".
ELIM_RULES = {
    "crimpy": "Crimps Only", "pinchy": "Pinches Only", "slopey": "Slopers Only", "juggy": "No Jugs",
    "compression": "No Feet", "technical": "No Arête", "mantle": "No Lip", "dyno": "Static",
    "powerful": "No Heel Hooks",
}


def _band(grade: int) -> str:
    return "easy" if grade <= 3 else "hard" if grade >= 9 else "mid"


def _theme(names: list[str]) -> list[tuple[str, str]]:
    out = []
    for n in names:
        band = "hard" if n.startswith("!") else "easy" if n.startswith("~") else "any"
        out.append((n.lstrip("!~"), band))
    return out


def rename_crag(problems: pd.DataFrame, seed: int = 8) -> pd.DataFrame:
    """Give the crag its names. Only the sector, boulder and name columns
    change; ``sector_order`` and ``boulder_order`` record the generated order
    so the map layout stays put whatever things are called."""
    rng = np.random.default_rng([seed, 777])
    p = problems.copy()
    old_sector, old_boulder = p["sector"].tolist(), p["boulder"].tolist()
    sector_rank = {s: i for i, s in enumerate(sorted(set(old_sector)))}
    pair_rank = {k: i for i, k in enumerate(sorted(set(zip(old_sector, old_boulder))))}
    p["sector_order"] = [sector_rank[s] for s in old_sector]
    p["boulder_order"] = [pair_rank[k] for k in zip(old_sector, old_boulder)]

    used: set[str] = set()
    pools = {k: [str(x) for x in rng.permutation(v)] for k, v in dict(
        easy=EASY_POOL, mid=MID_POOL, hard=HARD_POOL, traverse=TRAVERSE_POOL, elim=ELIM_POOL,
        choss=CHOSS_POOL, high=HIGHBALL_POOL).items()}

    def from_pool(*keys: str) -> str | None:
        for k in keys:
            for n in pools[k]:
                if n not in used:
                    used.add(n)
                    return n
        return None

    # Boulder names, with fallbacks if the crag was generated at another size.
    fallback = iter(BOULDER_FALLBACK)
    boulder_name: dict[tuple[str, str], str] = {}
    themes: dict[tuple[str, str], list[tuple[str, str]]] = {}
    for key in sorted(set(zip(old_sector, old_boulder)), key=pair_rank.get):
        if key in B:
            boulder_name[key], themes[key] = B[key][0], _theme(B[key][1])
        else:
            boulder_name[key], themes[key] = next(fallback, f"Boulder {pair_rank[key] + 1}"), []
    taken_boulders: set[str] = set()
    for key, n in boulder_name.items():
        while n in taken_boulders:
            n += " II"
        taken_boulders.add(n)
        boulder_name[key] = n

    names: list[str | None] = [None] * len(p)
    tags = [set(str(s).split("|")) for s in p["styles"]]
    grade, quality = p["grade"].to_numpy(), p["true_quality"].to_numpy()
    sit = p["sit_start"].to_numpy()

    # Keep the old names that already worked (their best-quality occurrence).
    old_name = problems["name"].tolist()
    for base in sorted(KEEP):
        hits = [i for i, n in enumerate(old_name) if n.removesuffix(" Sit").removesuffix(" Eliminate") == base]
        if hits:
            i = max(hits, key=lambda j: quality[j])
            names[i] = old_name[i]
            used.add(old_name[i])

    by_boulder: dict[tuple[str, str], list[int]] = {}
    for i, key in enumerate(zip(old_sector, old_boulder)):
        by_boulder.setdefault(key, []).append(i)

    for key in sorted(by_boulder, key=pair_rank.get):
        idx, theme = by_boulder[key], themes[key]
        bname = boulder_name[key]

        def take(i: int, bands: tuple[str, ...]) -> bool:
            for n, b in theme:
                if b in bands and n not in used:
                    names[i] = n
                    used.add(n)
                    return True
            return False

        lines = [i for i in idx if names[i] is None and "eliminate" not in tags[i] and "traverse" not in tags[i]]
        # The hardest lines get the theme's ominous names, the best easy ones its playful names.
        for i in sorted(lines, key=lambda j: (-grade[j], -quality[j])):
            if _band(grade[i]) == "hard":
                take(i, ("hard",))
        for i in sorted(lines, key=lambda j: -quality[j]):
            if names[i] is None and _band(grade[i]) == "easy":
                take(i, ("easy",))
        # Sit starts are often the sit version of a stand line.
        named_lines = [j for j in lines if names[j] is not None and not sit[j]]
        for i in lines:
            if names[i] is None and sit[i] and rng.random() < 0.45:
                parents = [j for j in named_lines if 0 <= grade[i] - grade[j] <= 2 and tags[i] & tags[j]]
                if parents:
                    n = f"{names[parents[int(rng.integers(len(parents)))]]} Sit"
                    if n not in used:
                        names[i] = n
                        used.add(n)
        # Everything else on the boulder, best lines first.
        for i in sorted(lines, key=lambda j: -quality[j]):
            if names[i] is not None:
                continue
            band = _band(grade[i])
            if quality[i] < 0.7 and rng.random() < 0.7 and (n := from_pool("choss")):
                names[i] = n
                continue
            fits = ("any", band) + (("easy",) if band == "mid" else ())
            if take(i, fits):
                continue
            if "highball" in tags[i] and band != "easy" and (n := from_pool("high")):
                names[i] = n
                continue
            names[i] = from_pool(band, "mid", "easy", "hard")
        # Traverses: the boulder's own traverse first, then the pool.
        short = bname.removeprefix("The ").removesuffix("'s Rock")
        for i in sorted(idx, key=lambda j: -quality[j]):
            if names[i] is None and "traverse" in tags[i]:
                n = f"{short} Traverse"
                if n in used:
                    n = from_pool("traverse", "mid")
                else:
                    used.add(n)
                names[i] = n
        # Eliminates: usually a rule added to a line on the same boulder.
        named = [j for j in idx if names[j] is not None and "eliminate" not in tags[j] and not names[j].endswith(")")]
        for i in sorted(idx, key=lambda j: -quality[j]):
            if names[i] is not None:
                continue
            parents = [j for j in named if grade[j] <= grade[i]]
            n = None
            if parents and rng.random() < 0.6:
                parent = names[parents[int(rng.integers(len(parents)))]].removesuffix(" Sit")
                rules = [ELIM_RULES[t] for t in sorted(tags[i]) if t in ELIM_RULES]
                n = f"{parent} ({rules[int(rng.integers(len(rules)))]})" if rules else f"{parent} Eliminate"
                if n in used:
                    n = None
                else:
                    used.add(n)
            names[i] = n or from_pool("elim", "mid", "hard")

    for i, n in enumerate(names):  # should never happen, but never leave a problem nameless
        if n is None:
            names[i] = f"Unnamed {i}"
    p["name"] = names
    p["sector"] = [SECTORS.get(s, s) for s in old_sector]
    p["boulder"] = [boulder_name[k] for k in zip(old_sector, old_boulder)]
    return p


# One line per boulder, shown when you walk up to it and on the maps. Each
# matches the boulder as generated (height, angle, holds, how good it is).
BOULDER_DESC = {
    # The Tailgate
    "Gus's Rock": "The first boulder past the kiosk: a friendly slab where Ranger Gus finally put down his citation book and tried a problem.",
    "The Billboard": "A tall, blank slab facing the road, big and flat enough to rent out to advertisers.",
    "The Tollbooth": "A small, technical slab right at the park entrance. Everyone stops here on the way in.",
    "The Dumpster": "Squats next to the trash bins. Jugs, raccoons, and a faint smell of last week's pizza.",
    "The Curb": "A knee-high lowball at the edge of the asphalt. Mind your ankles.",
    "Pickles' Rock": "A slopey overhang where Pickles, the lot dog, naps in the shade and steals unattended sandwiches.",
    "The Tailpipe": "A low roof you climb lying on your back, like a mechanic sliding under a car.",
    "The Cooler": "A flat-topped slab at tailgate height, the traditional spot for lunch and potato salad.",
    # The Schoolhouse
    "The Belfry": "The tallest block at the old schoolhouse, where the bell tower stood. Crimpy, committing, and full of bats at dusk.",
    "The Gymnasium": "A roof the size of a school gym, with enough holds for every link-up and eliminate imaginable.",
    "The Blackboard": "A tall, flat face of dark granite, smooth as slate, with crimps like chalk marks.",
    "Detention": "A squat overhang behind the schoolhouse foundation, where the hard cases spend their afternoons.",
    "The Desk": "A small, flat-topped block carved with initials by a century of bored students.",
    "The Sandbox": "A low, friendly rock in a patch of sand. The place to bring kids and first-timers.",
    "The Cafeteria": "A steep, juggy overhang where everyone gathers at lunchtime. Things get messy.",
    "The Apple": "A small, perfect boulder of rust-tinged granite. Only four problems, every one a gem.",
    "The Science Lab": "A steep, powerful block where the locals experiment with beta. Some experiments go wrong.",
    "The Lunchbox": "A compact little overhang packed with hard problems.",
    # Millrace Caves
    "The Engine Room": "The biggest cave at the old mill, stained with machine grease and crowded with eliminates. The mill burned here in 1891.",
    "The Grotto": "A dripping cave lit by reflections off Mill Pond. Its hardest lines go deep into the dark.",
    "The Millstone": "A round, worn boulder shaped like a giant grindstone, with slopers all the way around.",
    "The Bullfrog": "A squat green boulder at the edge of Mill Pond. In spring the peepers are deafening.",
    "The Waterwheel": "A boulder beside the old millrace, with the wheel's iron axle still sticking out of the stone.",
    "The Doorstop": "A wedge-shaped slab that once propped open the mill door. Small, but the slab climbing is superb.",
    # Hawkwatch
    "Old Baldy": "The bald granite dome at the summit, where the hawk counters sit with binoculars every fall. Its traverse is the park's most famous problem.",
    "The Thermal Slab": "A broad slab tilted to the sun, where warm air rises and hawks circle overhead.",
    "The Lookout": "A tall block on the summit's edge with the best view in the park: the reservoir one way, the quarry the other.",
    "The Aerie": "A tall, reachy block where eagles once nested. The hard lines are about flying.",
    "The Birdhouse": "A boxy little overhang with a bird feeder nailed to the oak beside it.",
    "The Raptor": "The tallest prow on the summit, leaning out over the trail like a bird about to strike.",
    "The Beak": "A pointed block with a sharp, hooked tip.",
    "The Weathervane": "A summit block under the rusted weathervane of a long-gone fire tower.",
    "The Perch": "A small, steep boulder where the hawks land. Short, but brutally powerful.",
    "The Nest": "A round boulder with a bowl-shaped top full of pine needles.",
    "The Chickadee": "A tiny, cheerful boulder of easy problems, popular with beginners and chickadees.",
    # Bracken Gully
    "The Wardrobe": "A tall, dark, boxy block deep in the ferns. Step under the overhang and it's always winter.",
    "The Fossil": "A steep block with ancient ferns pressed into its shadowed underside, or so the locals swear.",
    "Mossback": "A boulder carpeted in moss that never quite dries. Bring a brush.",
    "The Toadstool": "A tall boulder with a wide, overhanging cap, like a giant mushroom.",
    "The Fiddlehead": "A rounded boulder among the ferns. In April the fiddleheads unfurl around its base.",
    "The Hobbit Hole": "A low cave with a round opening, tucked into the gully bank. Cozy, until you try the V13.",
    "The Sundew": "A steep block beside a boggy seep full of carnivorous plants.",
    "The Lamp Post": "A tall, slim pillar standing alone in the ferns. Nobody knows who put the lantern on top.",
    "The Stump": "A squat, flat-topped block beside an old-growth stump. One problem.",
    # The Spillway
    "The Floodgate": "The big block beside the dam. In drought years you can see the drowned village's church steeple from its top.",
    "The Retaining Wall": "A long, flat slab that looks almost poured, right below the dam's concrete wall.",
    "The Buoy": "A round little boulder at the water's edge that floods every spring.",
    # The Cellar Holes
    "The Hearthstone": "A soot-blackened block beside a cellar hole, where a farmhouse chimney once stood. People say it's haunted.",
    "The Stone Wall": "A slab cut by an old stone wall that wanders off into the woods, built by farmers who never met a rock they didn't stack.",
    "The Barn": "A boulder with a roof like the sagging barn that once leaned against it.",
    "The Root Cellar": "A low, dark boulder half-sunk into the hillside, cool even in August.",
    "The Woodshed": "A short, steep block where the village kept its firewood. Something nasty lives here.",
    "The Well": "A tall block beside a stone-lined well. Don't drop your chalk bag.",
    # Hemlock Hollow
    "The Squeezebox": "A squat, steep box of granite in the hemlock shade, all squeezing and hugging.",
    "Socrates": "A tall, thoughtful-looking boulder under the darkest hemlocks. Question everything, especially the beta.",
    "The Snapping Turtle": "A low, domed boulder shaped like a turtle's shell. Its V13 bites.",
    "The Owl": "A tall block in the hemlocks where a barred owl calls at dusk.",
    "The Hush": "A roof in the quietest corner of the park. People whisper here without knowing why.",
    # The Grout Piles
    "The Monument": "A tall, squared-off block the quarrymen cut for a war memorial and never shipped. The best highball in the park.",
    "The Tombstone": "A tall, polished slab standing like an old headstone over the quarry waste.",
    "The Headwall": "Part of the quarry's original cut face, still showing drill marks. Tall, technical, and right above the swimming hole.",
    "The Stonecutters": "A block covered in practice chisel marks from the stonecutters who learned their trade here.",
    "The Powder House": "A low, steep block beside the ruined shed where the quarry kept its blasting powder.",
    "The Anvil": "A flat-topped, anvil-shaped block where the quarry blacksmith worked. Solid crimps on good rock.",
    "The Derrick": "A tall block still wearing the iron eyebolts of the quarry's old derrick.",
    "The Swimming Hole": "A steep block at the edge of the flooded quarry pit. Swimming is not allowed, which nobody believes.",
    "The Offcut": "A neatly sawn slab of waste granite left over from the quarry.",
    "The Rubble": "A heap of broken grout. Climbable, more or less.",
    "The Reject": "A cracked block the quarry turned down. One problem, and not much of one.",
    # Back Forty
    "The Scarecrow": "A tall, gangly block standing alone at the end of the far field, arms out like a scarecrow.",
    "The Tractor": "A boulder beside a rusted tractor nobody has moved since the farm closed.",
    "The Haybale": "A round, squat boulder in the old hayfield, shaped like a bale of hay.",
    "The Cow Pie": "A low, flat boulder in the old pasture. Watch where you put your pad.",
    "The Salt Lick": "A tall boulder the dairy cows licked smooth, or so the story goes.",
    "The Milk Can": "A small, round boulder by the gate where the dairy left its milk cans.",
}
